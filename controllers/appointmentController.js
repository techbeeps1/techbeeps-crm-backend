const Appointment = require('../models/appointmentModel');
const Employability = require('../models/employabilityModel');
const JobSchedule = require('../models/jobSchedule');
const Company = require('../models/companyModel');
const { checkResourceConflicts } = require('../utils/resourceConflictEngine');
const { dispatchOutboxEmail, EMAIL_EVENTS } = require('../utils/emailOutboxService');

/**
 * Pre-flight Conflict Check Endpoint
 * POST /api/appointment/check-conflicts
 */
exports.checkConflicts = async (req, res) => {
  try {
    const {
      appointmentId,
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      assignedEmployees,
      vehicle,
      vehicleName,
      surveyDetails,
    } = req.body;

    const conflictResult = await checkResourceConflicts({
      appointmentId,
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      assignedEmployees,
      vehicle,
      vehicleName,
      surveyDetails,
    });

    return res.status(200).json({
      success: true,
      hasConflicts: conflictResult.hasConflicts,
      hasBlockConflicts: conflictResult.hasBlockConflicts,
      conflicts: conflictResult.conflicts,
      warnings: conflictResult.warnings,
    });
  } catch (error) {
    console.error('Error checking resource conflicts:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create Appointment with Conflict Engine & Publication Workflow
 * POST /api/appointment
 */
exports.createAppointment = async (req, res) => {
  try {
    const {
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      workLocation,
      departureLocation,
      assignedEmployees,
      vehicle,
      vehicleName,
      status,
      notes,
      id,
      publicationStatus = 'Draft',
      allowOverride = false,
      overrideReason = '',
      surveyDetails,
      sendCustomerEmail = false,
      ...extraFields
    } = req.body;

    const employeesList = Array.isArray(assignedEmployees) ? assignedEmployees : [];

    // 1. Conflict Detection Engine
    const conflictResult = await checkResourceConflicts({
      appointmentId: id || null,
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      assignedEmployees: employeesList,
      vehicle,
      vehicleName,
      surveyDetails,
    });

    let overrideRecord = null;
    if (conflictResult.hasBlockConflicts) {
      if (!allowOverride) {
        return res.status(409).json({
          success: false,
          code: 'RESOURCE_CONFLICT',
          message: 'Resource conflicts detected. An authorized override is required to proceed.',
          conflicts: conflictResult.conflicts,
          warnings: conflictResult.warnings,
          requiresOverride: true,
        });
      }

      // Check role authorization for override
      const allowedRoles = ['Admin', 'Manager', 'Planner', 'HR'];
      const userRole = req.user?.role || 'Staff';
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_OVERRIDE',
          message: `Role '${userRole}' is not authorized to override resource conflicts. Required: Admin, Manager, Planner, or HR.`,
        });
      }

      // Check reason length
      const trimmedReason = String(overrideReason || '').trim();
      if (trimmedReason.length < 5) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_OVERRIDE_REASON',
          message: 'An auditable override reason of at least 5 characters is required to bypass scheduling conflicts.',
        });
      }

      overrideRecord = {
        conflicts: conflictResult.conflicts,
        reason: trimmedReason,
        overriddenBy: req.user?.userId || req.user?._id || null,
        overriddenByName: req.user?.username || 'Authorized User',
        overriddenAt: new Date(),
        userRole,
      };
    }

    // 2. Persist Employability Records
    let savedEmployabilityIds = [];
    if (employeesList.length > 0) {
      const employabilityRecords = employeesList.map((emp) => ({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        workType: emp.workType,
        startTime: emp.startTime,
        endTime: emp.endTime,
        vehicle: emp.vehicle || null,
      }));
      const savedEmployability = await Employability.insertMany(employabilityRecords);
      savedEmployabilityIds = savedEmployability.map((emp) => emp._id);
    }

    // 3. Assemble Appointment Document
    const isPublished = publicationStatus === 'Published';
    const appointmentData = {
      jobId: jobId || null,
      date,
      startTime,
      endTime,
      appointmentType: appointmentType || 'Move',
      workLocation,
      departureLocation,
      assignedEmployees: savedEmployabilityIds,
      vehicle: vehicle || null,
      vehicleName: vehicleName || '',
      status: status || (isPublished ? 'Scheduled' : (savedEmployabilityIds.length > 0 ? 'Scheduled' : 'Draft')),
      publicationStatus: isPublished ? 'Published' : 'Draft',
      publishedAt: isPublished ? new Date() : null,
      publishedBy: isPublished ? (req.user?.userId || req.user?._id) : null,
      publishedByName: isPublished ? (req.user?.username || 'Planner') : null,
      surveyDetails: surveyDetails || null,
      notes,
      conflictOverrides: overrideRecord ? [overrideRecord] : [],
      notificationLog: [],
      scheduleHistory: [],
    };

    let newAppointment;
    if (id) {
      newAppointment = await Appointment.findByIdAndUpdate(id, appointmentData, { new: true });
      if (!newAppointment) {
        return res.status(404).json({ message: 'Appointment not found' });
      }
    } else {
      newAppointment = new Appointment(appointmentData);
      await newAppointment.save();
    }

    // 4. Idempotent Customer Publication Notification (Suppressed in Draft)
    if (isPublished && sendCustomerEmail && jobId) {
      try {
        const jobDoc = await JobSchedule.findById(jobId).populate('customer');
        const customer = jobDoc?.customer;
        const recipient = customer?.email;

        if (recipient) {
          const isSurvey = appointmentType === 'Survey';
          const eventType = isSurvey ? EMAIL_EVENTS.SURVEY_SCHEDULED : EMAIL_EVENTS.MOVE_SCHEDULED;
          const idempotencyKey = `APPT-PUB-${newAppointment._id}-${new Date(date).getTime()}-${eventType}`;

          const company = await Company.findOne();
          const dispatchRes = await dispatchOutboxEmail({
            eventType,
            recipient,
            subject: `Universal Movers: ${isSurvey ? 'Survey' : 'Move'} Appointment Confirmed for ${new Date(date).toLocaleDateString('en-GB')}`,
            context: {
              company,
              customer,
              job: jobDoc,
              appointment: newAppointment,
              date: new Date(date).toLocaleDateString('en-GB'),
            },
            idempotencyKey,
          });

          newAppointment.notificationLog.push({
            event: eventType,
            recipient,
            sentAt: new Date(),
            status: dispatchRes.success ? 'Delivered' : 'Queued',
            outboxId: dispatchRes.emailId || null,
          });
          await newAppointment.save();
        }
      } catch (emailErr) {
        console.error('Failed to dispatch appointment publication email:', emailErr.message);
      }
    }

    return res.status(id ? 200 : 201).json({
      success: true,
      appointment: newAppointment,
      conflicts: conflictResult.conflicts,
      warnings: conflictResult.warnings,
      overridden: !!overrideRecord,
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Get Appointments with Role-based filtering
 * GET /api/appointment
 */
exports.getAppointments = async (req, res) => {
  try {
    const { jobId, publicationStatus } = req.query;
    const filter = {};

    if (jobId && jobId !== 'undefined' && jobId !== 'null') {
      filter.jobId = jobId;
    }

    if (publicationStatus && ['Draft', 'Published'].includes(publicationStatus)) {
      filter.publicationStatus = publicationStatus;
    }

    // Role-based filtering: Non-admins/managers only see appointments assigned to them
    const privilegedRoles = ['Admin', 'Manager', 'Planner'];
    if (req.user && !privilegedRoles.includes(req.user.role)) {
      const matchConditions = [];
      if (req.user.userId) {
        matchConditions.push({ employeeId: req.user.userId });
      }
      if (req.user.username) {
        const escapedName = req.user.username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        matchConditions.push({
          employeeName: { $regex: new RegExp(escapedName, 'i') },
        });
      }

      if (matchConditions.length > 0) {
        const myEmployabilities = await Employability.find({ $or: matchConditions }, '_id');
        const empIds = myEmployabilities.map((e) => e._id);
        filter.assignedEmployees = { $in: empIds };
      } else {
        filter.assignedEmployees = { $in: [] };
      }
    }

    const appointments = await Appointment.find(filter)
      .populate({
        path: 'assignedEmployees',
        populate: {
          path: 'vehicle',
          select: 'name licensePlate model vehicleType requiredLicense',
        },
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status relocation',
        populate: {
          path: 'customer',
          select: 'firstName lastName email mobile contact address',
        },
      })
      .populate('vehicle', 'name licensePlate model vehicleType requiredLicense')
      .populate('surveyDetails.estimatorId', 'username email')
      .populate('conflictOverrides.overriddenBy', 'username role')
      .sort({ date: 1, startTime: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get Appointment By ID
 * GET /api/appointment/:id
 */
exports.getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate({
        path: 'assignedEmployees',
        populate: {
          path: 'vehicle',
          select: 'name licensePlate model vehicleType requiredLicense',
        },
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status relocation',
        populate: {
          path: 'customer',
          select: 'firstName lastName email mobile contact address',
        },
      })
      .populate('vehicle', 'name licensePlate model vehicleType requiredLicense')
      .populate('surveyDetails.estimatorId', 'username email')
      .populate('conflictOverrides.overriddenBy', 'username role');

    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Update Appointment with Conflict Verification, Reschedule Tracking & Publication
 * PUT /api/appointment/:id
 */
exports.updateAppointment = async (req, res) => {
  const appointmentId = req.params.id;

  try {
    const {
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      workLocation,
      departureLocation,
      assignedEmployees,
      vehicle,
      vehicleName,
      status,
      notes,
      publicationStatus,
      allowOverride = false,
      overrideReason = '',
      surveyDetails,
      sendCustomerEmail = false,
    } = req.body;

    // Find existing appointment
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const employeesList = Array.isArray(assignedEmployees) ? assignedEmployees : [];

    // 1. Conflict Detection Engine
    const conflictResult = await checkResourceConflicts({
      appointmentId,
      jobId: jobId || appointment.jobId,
      date: date || appointment.date,
      startTime: startTime || appointment.startTime,
      endTime: endTime || appointment.endTime,
      appointmentType: appointmentType || appointment.appointmentType,
      assignedEmployees: employeesList,
      vehicle: vehicle !== undefined ? vehicle : appointment.vehicle,
      vehicleName: vehicleName !== undefined ? vehicleName : appointment.vehicleName,
      surveyDetails: surveyDetails || appointment.surveyDetails,
    });

    let overrideRecord = null;
    if (conflictResult.hasBlockConflicts) {
      if (!allowOverride) {
        return res.status(409).json({
          success: false,
          code: 'RESOURCE_CONFLICT',
          message: 'Resource conflicts detected. An authorized override is required to proceed.',
          conflicts: conflictResult.conflicts,
          warnings: conflictResult.warnings,
          requiresOverride: true,
        });
      }

      // Check role authorization
      const allowedRoles = ['Admin', 'Manager', 'Planner', 'HR'];
      const userRole = req.user?.role || 'Staff';
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_OVERRIDE',
          message: `Role '${userRole}' is not authorized to override resource conflicts. Required: Admin, Manager, Planner, or HR.`,
        });
      }

      // Check reason length
      const trimmedReason = String(overrideReason || '').trim();
      if (trimmedReason.length < 5) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_OVERRIDE_REASON',
          message: 'An auditable override reason of at least 5 characters is required to bypass scheduling conflicts.',
        });
      }

      overrideRecord = {
        conflicts: conflictResult.conflicts,
        reason: trimmedReason,
        overriddenBy: req.user?.userId || req.user?._id || null,
        overriddenByName: req.user?.username || 'Authorized User',
        overriddenAt: new Date(),
        userRole,
      };
    }

    // 2. Track Schedule History if Date/Times Changed on Published Appointment
    const dateChanged = date && new Date(date).getTime() !== new Date(appointment.date).getTime();
    const startChanged = startTime && new Date(startTime).getTime() !== new Date(appointment.startTime).getTime();
    const endChanged = endTime && new Date(endTime).getTime() !== new Date(appointment.endTime).getTime();
    const wasPublished = appointment.publicationStatus === 'Published';
    const isNowPublished = publicationStatus === 'Published' || (publicationStatus === undefined && wasPublished);

    if (wasPublished && (dateChanged || startChanged || endChanged)) {
      appointment.scheduleHistory.push({
        previousDate: appointment.date,
        previousStartTime: appointment.startTime,
        previousEndTime: appointment.endTime,
        previousPublicationStatus: appointment.publicationStatus,
        changedAt: new Date(),
        changedBy: req.user?.userId || req.user?._id || null,
        reason: 'Rescheduled appointment time window',
      });
    }

    // 3. Delete old employability records and insert new ones
    if (appointment.assignedEmployees && appointment.assignedEmployees.length) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    let savedIds = [];
    if (employeesList.length > 0) {
      const employabilityRecords = employeesList.map((emp) => ({
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        workType: emp.workType,
        startTime: emp.startTime,
        endTime: emp.endTime,
        vehicle: emp.vehicle || null,
      }));

      const savedEmployability = await Employability.insertMany(employabilityRecords);
      savedIds = savedEmployability.map((item) => item._id);
    }

    // 4. Update appointment fields
    if (jobId !== undefined) appointment.jobId = jobId;
    if (date !== undefined) appointment.date = date;
    if (startTime !== undefined) appointment.startTime = startTime;
    if (endTime !== undefined) appointment.endTime = endTime;
    if (appointmentType !== undefined) appointment.appointmentType = appointmentType;
    if (workLocation !== undefined) appointment.workLocation = workLocation;
    if (departureLocation !== undefined) appointment.departureLocation = departureLocation;
    if (notes !== undefined) appointment.notes = notes;
    if (surveyDetails !== undefined) appointment.surveyDetails = surveyDetails;
    appointment.assignedEmployees = savedIds;

    if (status !== undefined) appointment.status = status;
    if (vehicle !== undefined) appointment.vehicle = vehicle || null;
    if (vehicleName !== undefined) appointment.vehicleName = vehicleName || '';

    // Handle Publication Transitions
    if (publicationStatus) {
      if (publicationStatus === 'Published' && !wasPublished) {
        appointment.publicationStatus = 'Published';
        appointment.publishedAt = new Date();
        appointment.publishedBy = req.user?.userId || req.user?._id || null;
        appointment.publishedByName = req.user?.username || 'Planner';
      } else if (publicationStatus === 'Draft') {
        appointment.publicationStatus = 'Draft';
      }
    }

    if (overrideRecord) {
      appointment.conflictOverrides.push(overrideRecord);
    }

    await appointment.save();

    // 5. Idempotent Customer Rescheduling / Publication Notification
    if (isNowPublished && sendCustomerEmail && (appointment.jobId || jobId)) {
      try {
        const targetJobId = jobId || appointment.jobId;
        const jobDoc = await JobSchedule.findById(targetJobId).populate('customer');
        const customer = jobDoc?.customer;
        const recipient = customer?.email;

        if (recipient) {
          const isSurvey = (appointmentType || appointment.appointmentType) === 'Survey';
          const isRescheduled = wasPublished && (dateChanged || startChanged || endChanged);
          let eventType;
          if (isSurvey) {
            eventType = isRescheduled ? EMAIL_EVENTS.SURVEY_RESCHEDULED : EMAIL_EVENTS.SURVEY_SCHEDULED;
          } else {
            eventType = isRescheduled ? EMAIL_EVENTS.MOVE_RESCHEDULED : EMAIL_EVENTS.MOVE_SCHEDULED;
          }

          const curDate = date || appointment.date;
          const idempotencyKey = `APPT-PUB-${appointment._id}-${new Date(curDate).getTime()}-${eventType}`;

          const company = await Company.findOne();
          const dispatchRes = await dispatchOutboxEmail({
            eventType,
            recipient,
            subject: `Universal Movers: ${isSurvey ? 'Survey' : 'Move'} Appointment ${isRescheduled ? 'Rescheduled' : 'Confirmed'} for ${new Date(curDate).toLocaleDateString('en-GB')}`,
            context: {
              company,
              customer,
              job: jobDoc,
              appointment,
              date: new Date(curDate).toLocaleDateString('en-GB'),
            },
            idempotencyKey,
          });

          appointment.notificationLog.push({
            event: eventType,
            recipient,
            sentAt: new Date(),
            status: dispatchRes.success ? 'Delivered' : 'Queued',
            outboxId: dispatchRes.emailId || null,
          });
          await appointment.save();
        }
      } catch (emailErr) {
        console.error('Failed to dispatch appointment notification:', emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment updated successfully',
      appointment,
      conflicts: conflictResult.conflicts,
      warnings: conflictResult.warnings,
      overridden: !!overrideRecord,
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    return res.status(500).json({ message: error.message });
  }
};

/**
 * Delete Appointment
 * DELETE /api/appointment/:id
 */
exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        message: 'Appointment not found',
      });
    }

    // Delete related Employability records
    if (appointment.assignedEmployees && appointment.assignedEmployees.length > 0) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    // Delete Appointment
    await Appointment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Appointment and related employability records deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
