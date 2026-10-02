const Appointment = require('../models/appointmentModel'); // Adjust path as needed
const Employability = require('../models/employabilityModel'); // Adjust path as needed


exports.createAppointment = async (req, res) => {
    try {
        const { 
            jobId, date, startTime, endTime, appointmentType, 
            workLocation, departureLocation,
            assignedEmployees,
            vehicle, vehicleName, status,
            notes, id, ...extraFields
        } = req.body;

        const employeesList = Array.isArray(assignedEmployees) ? assignedEmployees : [];
        let savedEmployabilityIds = [];

        if (employeesList.length > 0) {
            const employabilityRecords = employeesList.map(emp => ({
                employeeId: emp.employeeId,
                employeeName: emp.employeeName,
                workType: emp.workType,
                startTime: emp.startTime,
                endTime: emp.endTime,
                vehicle: emp.vehicle || null,
            }));
            const savedEmployability = await Employability.insertMany(employabilityRecords);
            savedEmployabilityIds = savedEmployability.map(emp => emp._id);
        }

        const appointmentData = {
            jobId,
            date,
            startTime,
            endTime,
            appointmentType,
            workLocation,
            departureLocation,
            assignedEmployees: savedEmployabilityIds,
            vehicle: vehicle || null,
            vehicleName: vehicleName || '',
            status: status || (savedEmployabilityIds.length > 0 ? 'Scheduled' : 'Draft'),
            notes,
        };

        let newAppointment;
        if (id) {
            newAppointment = await Appointment.findByIdAndUpdate(id, appointmentData, { new: true });
            if (!newAppointment) {
                return res.status(404).json({ message: 'Appointment not found' });
            }
            res.status(200).json(newAppointment);
        } else {
            newAppointment = new Appointment(appointmentData);
            await newAppointment.save();
            res.status(201).json(newAppointment);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAppointments = async (req, res) => {
  try {
    const { jobId } = req.query;
    const filter = {};

    if (jobId && jobId !== 'undefined' && jobId !== 'null') {
      filter.jobId = jobId;
    }

    // Role-based filtering: Non-admins only see appointments assigned to them
    if (req.user && req.user.role !== 'Admin') {
      const matchConditions = [];
      if (req.user.userId) {
        matchConditions.push({ employeeId: req.user.userId });
      }
      if (req.user.username) {
        const escapedName = req.user.username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        matchConditions.push({
          employeeName: { $regex: new RegExp(escapedName, 'i') }
        });
      }

      if (matchConditions.length > 0) {
        const myEmployabilities = await Employability.find({ $or: matchConditions }, '_id');
        const empIds = myEmployabilities.map(e => e._id);
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
          select: 'name licensePlate model vehicleType',
        },
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName email mobile contact address',
        },
      })
      .sort({ date: 1, startTime: 1 });

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAppointmentById = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate({
        path: 'assignedEmployees',
        populate: {
          path: 'vehicle',
          select: 'name licensePlate model vehicleType',
        },
      })
      .populate({
        path: 'jobId',
        select: 'index customer load unload status',
        populate: {
          path: 'customer',
          select: 'firstName lastName email mobile contact address',
        },
      });
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });
    res.status(200).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
    } = req.body;

    // Find existing appointment
    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    // Delete old employability records
    if (
      appointment.assignedEmployees &&
      appointment.assignedEmployees.length
    ) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    const employeesList = Array.isArray(assignedEmployees) ? assignedEmployees : [];
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

    // Update appointment
    appointment.jobId = jobId;
    appointment.date = date;
    appointment.startTime = startTime;
    appointment.endTime = endTime;
    appointment.appointmentType = appointmentType;
    appointment.workLocation = workLocation;
    appointment.departureLocation = departureLocation;
    appointment.notes = notes;
    appointment.assignedEmployees = savedIds;
    if (status) appointment.status = status;
    if (vehicle !== undefined) appointment.vehicle = vehicle || null;
    if (vehicleName !== undefined) appointment.vehicleName = vehicleName || '';

    await appointment.save();

    res.status(200).json({
      message: "Appointment updated successfully",
      appointment,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    // Delete related Employability records
    if (
      appointment.assignedEmployees &&
      appointment.assignedEmployees.length > 0
    ) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    // Delete Appointment
    await Appointment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success:true,  
      message: "Appointment and related employability records deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
        success:false,
      message: error.message,
    });
  }
};