const JobSchedule = require("../models/jobSchedule");
const { ObjectId } = require("mongodb");
const Customer = require("../models/customer");
const notes = require("../models/job/notes");
const Package = require('../models/PackageModel');
const ValuationRooms = require("../models/Valuation/valuationRoomDetail");
const FurnitureType = require("../models/Valuation/furnitureTypeModel");
const Invoice = require("../models/invoice");
const Finance = require("../models/finance");
const ServiceType = require("../models/Valuation/serviceTypeModel");
const {
  CANONICAL_STATUSES,
  normalizeStatus,
  validateTransition,
  isWorkerAssignedToJob,
} = require("../utils/jobStateMachine");

/**
 * Create Job Schedule (Initial Intake)
 * POST /api/jobSchedule
 */
exports.jobSchedule = async (req, res) => {
  try {
    const {
      date,
      customer,
      package,
      load,
      unload,
      knownAddress,
      services,
      priceAgree,
      hasElevator,
      unloadElevator,
      status,
    } = req.body;

    if (!customer) {
      return res.status(400).json({ message: 'Customer ID is required to schedule a job' });
    }
    const customerExists = await Customer.findById(customer);
    if (!customerExists) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const packageExists = await Package.findById(package);
    if (!packageExists) {
      return res.status(404).json({ message: 'Package not found' });
    }

    const initialStatus = normalizeStatus(status) || 'PENDING';
    const initialHistory = [
      {
        fromStatus: 'INITIAL',
        toStatus: initialStatus,
        changedBy: req.user?.userId || req.user?._id || null,
        changedByName: req.user?.username || 'System Intake',
        userRole: req.user?.role || 'Staff',
        changedAt: new Date(),
        reason: 'Initial job creation',
      },
    ];

    const newJobSchedule = new JobSchedule({
      date,
      customer,
      package,
      load,
      unload,
      knownAddress,
      services,
      priceAgree,
      hasElevator,
      unloadElevator,
      status: initialStatus,
      statusHistory: initialHistory,
      executionDetails: {},
    });

    const savedJobSchedule = await newJobSchedule.save();
    res.status(201).json(savedJobSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create job schedule', error: error.message });
  }
};

/**
 * Update Job Schedule with State Machine Transition Controls
 * PUT /api/job-schedule/:id
 */
exports.updateJobSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, customer, package, load, unload, knownAddress, status, offer, invoice } = req.body;

    const jobSchedule = await JobSchedule.findById(id);
    if (!jobSchedule) {
      return res.status(404).json({ message: 'Job schedule not found' });
    }

    if (customer) {
      const customerExists = await Customer.findById(customer);
      if (!customerExists) {
        return res.status(404).json({ message: 'Referenced customer does not exist' });
      }
      jobSchedule.customer = customer;
    }

    // EXEC-32: Server-enforced State Machine Validation
    if (status) {
      const transitionCheck = await validateTransition({
        currentStatus: jobSchedule.status,
        targetStatus: status,
        jobDoc: jobSchedule,
        user: req.user,
        reason: req.body.reason || req.body.statusReason || '',
      });

      if (!transitionCheck.allowed) {
        return res.status(transitionCheck.statusCode || 422).json({
          success: false,
          code: transitionCheck.code,
          message: transitionCheck.message,
        });
      }

      if (!transitionCheck.isNoop) {
        if (!Array.isArray(jobSchedule.statusHistory)) {
          jobSchedule.statusHistory = [];
        }
        jobSchedule.statusHistory.push({
          fromStatus: transitionCheck.normCurrent,
          toStatus: transitionCheck.normTarget,
          changedBy: req.user?.userId || req.user?._id || null,
          changedByName: req.user?.username || 'Authorized User',
          userRole: req.user?.role || 'Staff',
          changedAt: new Date(),
          reason: req.body.reason || req.body.statusReason || '',
        });
        jobSchedule.status = transitionCheck.normTarget;
      }
    }

    jobSchedule.date = date || jobSchedule.date;
    jobSchedule.package = package || jobSchedule.package;
    jobSchedule.load = load || jobSchedule.load;
    jobSchedule.unload = unload || jobSchedule.unload;
    jobSchedule.knownAddress = knownAddress || jobSchedule.knownAddress;

    if (req.body.services !== undefined) {
      jobSchedule.services = req.body.services;
    }
    if (offer) {
      if (!jobSchedule.offer.includes(offer)) {
        jobSchedule.offer.push(offer);
      }
    }
    if (invoice) {
      if (!jobSchedule.invoice.includes(invoice)) {
        jobSchedule.invoice.push(invoice);
      }
    }

    const updatedJobSchedule = await jobSchedule.save();
    res.status(200).json({ msg: 'Job schedule updated successfully', updatedJobSchedule });
  } catch (error) {
    console.error('Error updating job schedule:', error);
    res.status(500).json({ message: 'Failed to update job schedule', error: error.message });
  }
};

/**
 * Dedicated Status Transition Endpoint
 * PUT /api/jobs/:id/status
 */
exports.transitionJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const jobSchedule = await JobSchedule.findById(id);
    if (!jobSchedule) {
      return res.status(404).json({ success: false, message: 'Job schedule not found' });
    }

    const transitionCheck = await validateTransition({
      currentStatus: jobSchedule.status,
      targetStatus: status,
      jobDoc: jobSchedule,
      user: req.user,
      reason,
    });

    if (!transitionCheck.allowed) {
      return res.status(transitionCheck.statusCode || 422).json({
        success: false,
        code: transitionCheck.code,
        message: transitionCheck.message,
      });
    }

    if (!transitionCheck.isNoop) {
      if (!Array.isArray(jobSchedule.statusHistory)) {
        jobSchedule.statusHistory = [];
      }
      jobSchedule.statusHistory.push({
        fromStatus: transitionCheck.normCurrent,
        toStatus: transitionCheck.normTarget,
        changedBy: req.user?.userId || req.user?._id || null,
        changedByName: req.user?.username || 'Authorized User',
        userRole: req.user?.role || 'Staff',
        changedAt: new Date(),
        reason: reason || '',
      });
      jobSchedule.status = transitionCheck.normTarget;
      await jobSchedule.save();
    }

    return res.status(200).json({
      success: true,
      message: `Job #${jobSchedule.index || ''} status transitioned to ${transitionCheck.normTarget}`,
      status: jobSchedule.status,
      statusHistory: jobSchedule.statusHistory,
    });
  } catch (error) {
    console.error('Error transitioning job status:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Update Field Execution Details (Worker & Foreman Journey)
 * PUT /api/jobs/:id/execution
 */
exports.updateExecutionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const jobSchedule = await JobSchedule.findById(id);
    if (!jobSchedule) {
      return res.status(404).json({ success: false, message: 'Job schedule not found' });
    }

    // Role & Assignment Access Control
    const isAuthorized = await isWorkerAssignedToJob(id, req.user?.userId, req.user?.role);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: 'Access denied: You are not assigned to this job.',
      });
    }

    const {
      startedAt,
      completedAt,
      startKilometres,
      endKilometres,
      operationalNotes,
      actualMovers,
      billableHours,
      payrollHours,
      materialsUsed,
      damageReports,
      customerSignature,
      colliCount,
      colliNotes,
      autoComplete,
    } = req.body;

    if (!jobSchedule.executionDetails) {
      jobSchedule.executionDetails = {};
    }

    const exec = jobSchedule.executionDetails;
    if (startedAt !== undefined) exec.startedAt = startedAt;
    if (completedAt !== undefined) exec.completedAt = completedAt;
    if (startKilometres !== undefined) exec.startKilometres = Number(startKilometres) || 0;
    if (endKilometres !== undefined) exec.endKilometres = Number(endKilometres) || 0;
    if (exec.endKilometres >= exec.startKilometres) {
      exec.totalKilometres = exec.endKilometres - exec.startKilometres;
    }
    if (operationalNotes !== undefined) exec.operationalNotes = operationalNotes;
    if (actualMovers !== undefined) exec.actualMovers = Number(actualMovers) || 0;
    if (billableHours !== undefined) exec.billableHours = Number(billableHours) || 0;
    if (payrollHours !== undefined) exec.payrollHours = Number(payrollHours) || 0;
    if (colliCount !== undefined) exec.colliCount = Number(colliCount) || 0;
    if (colliNotes !== undefined) exec.colliNotes = colliNotes;

    if (Array.isArray(materialsUsed)) {
      exec.materialsUsed = materialsUsed.map((m) => ({
        materialName: m.materialName || '',
        quantity: Number(m.quantity) || 0,
        unitPrice: Number(m.unitPrice) || 0,
        totalPrice: (Number(m.quantity) || 0) * (Number(m.unitPrice) || 0),
      }));
    }

    if (Array.isArray(damageReports)) {
      exec.damageReports = damageReports;
    }

    if (customerSignature) {
      exec.customerSignature = {
        signerName: customerSignature.signerName || '',
        signatureData: customerSignature.signatureData || '',
        signedAt: customerSignature.signedAt || new Date(),
        signerRole: customerSignature.signerRole || 'Customer',
      };
    }

    // Set foreman info
    if (!exec.foremanId) {
      exec.foremanId = req.user?.userId || req.user?._id || null;
      exec.foremanName = req.user?.username || 'Foreman';
    }

    // Auto-transition to COMPLETED if customer signature provided & complete requested
    if ((autoComplete || customerSignature) && jobSchedule.status === 'EXECUTION') {
      exec.completedAt = exec.completedAt || new Date();
      jobSchedule.status = 'COMPLETED';
      if (!Array.isArray(jobSchedule.statusHistory)) jobSchedule.statusHistory = [];
      jobSchedule.statusHistory.push({
        fromStatus: 'EXECUTION',
        toStatus: 'COMPLETED',
        changedBy: req.user?.userId || req.user?._id || null,
        changedByName: req.user?.username || 'Foreman',
        userRole: req.user?.role || 'Staff',
        changedAt: new Date(),
        reason: 'Move finished, signed and closed via foreman execution journey',
      });
    }

    jobSchedule.markModified('executionDetails');
    await jobSchedule.save();

    return res.status(200).json({
      success: true,
      message: 'Execution details saved successfully',
      executionDetails: jobSchedule.executionDetails,
      status: jobSchedule.status,
    });
  } catch (error) {
    console.error('Error updating execution details:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get Execution Details
 * GET /api/jobs/:id/execution
 */
exports.getExecutionDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const isAuthorized = await isWorkerAssignedToJob(id, req.user?.userId, req.user?.role);
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        code: 'ACCESS_DENIED',
        message: 'Access denied: You are not assigned to this job.',
      });
    }

    const jobSchedule = await JobSchedule.findById(id).select('executionDetails statusHistory status index load unload date');
    if (!jobSchedule) {
      return res.status(404).json({ success: false, message: 'Job schedule not found' });
    }

    return res.status(200).json({
      success: true,
      executionDetails: jobSchedule.executionDetails,
      status: jobSchedule.status,
      statusHistory: jobSchedule.statusHistory,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List Jobs
 * GET /api/jobList
 */
exports.jobList = async (req, res) => {
  try {
    const customerId = req.query.customer;
    const offer = req.query.offer;
    const invoice = req.query.invoice;
    const filter = {};
    if (customerId) {
      filter.customer = customerId;
    }
    if (offer) {
      filter.offer = offer;
    }
    if (invoice) {
      filter.invoice = invoice;
    }
    if (req.query.status) {
      const st = req.query.status.toLowerCase().trim();
      if (st === 'active') {
        filter.status = { $nin: ['COMPLETED', 'CANCELLED', 'DRAFT', 'completed', 'cancelled', 'draft'] };
      } else {
        filter.status = new RegExp(`^${req.query.status}$`, 'i');
      }
    }
    const jobList = await JobSchedule.find(filter)
      .select('customer date status load unload index package relocation services executionDetails statusHistory')
      .populate('customer', 'firstName lastName email contact mobile')
      .populate('package', 'name priceAgree')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ jobList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteJobSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const jobSchedule = await JobSchedule.findById(id);
    if (!jobSchedule) {
      return res.status(404).json({ message: 'Job schedule not found' });
    }
    await JobSchedule.findByIdAndDelete(id);
    res.status(200).json({ message: 'Job schedule successfully deleted' });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: 'Failed to delete job schedule', error: error.message });
  }
};

exports.searchedJobs = async (req, res) => {
  try {
    const searchTerm = (req.query?.searchTerm || '').toLowerCase().trim();
    const jobList = await JobSchedule.find()
      .populate('customer', 'firstName lastName email contact mobile')
      .lean();

    if (!searchTerm) {
      return res.json(jobList);
    }

    const filteredJobs = jobList.filter((job) => {
      const clientName = `${job.customer?.firstName || ''} ${job.customer?.lastName || ''}`.toLowerCase();
      const jobIndex = `${job.index || ''}`.toLowerCase();
      const loadLoc = `${job.load?.city || ''} ${job.load?.street || ''} ${job.load?.country || ''} ${job.load?.typeOfProperty || ''}`.toLowerCase();
      const unloadLoc = `${job.unload?.city || ''} ${job.unload?.street || ''} ${job.unload?.country || ''} ${job.unload?.typeOfProperty || ''}`.toLowerCase();
      return (
        clientName.includes(searchTerm) ||
        jobIndex.includes(searchTerm) ||
        loadLoc.includes(searchTerm) ||
        unloadLoc.includes(searchTerm)
      );
    });
    res.json(filteredJobs);
  } catch (error) {
    console.error("Error fetching Jobs:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.jobListByCustomerId = async (req, res) => {
  try {
    const rawId = req.query?.customerId;
    if (!rawId || !ObjectId.isValid(rawId)) {
      return res.status(400).json({ message: "Valid customerId is required" });
    }
    const customerId = new ObjectId(rawId);
    const jobListByCustomerId = await JobSchedule.find({
      $or: [
        { customer: customerId },
        { selectedCustomer: customerId }
      ]
    })
      .populate('customer', 'firstName lastName email contact mobile')
      .populate('package', 'name priceAgree')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      jobListByCustomerId: jobListByCustomerId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.jobNotes = async (req, res) => {
  try {
    const { jobId, genralNotes, employeeNotes, customerNotes, id } = req.body;
    if (id) {
      const existingNote = await notes.findById(id);
      if (existingNote) {
        existingNote.jobId = jobId || existingNote.jobId;
        existingNote.genralNotes = genralNotes || existingNote.genralNotes;
        existingNote.employeeNotes = employeeNotes || existingNote.employeeNotes;
        existingNote.customerNotes = customerNotes || existingNote.customerNotes;
        const updatedNote = await existingNote.save();
        return res.status(200).json({
          msg: "Data successfully updated!",
          data: updatedNote,
        });
      } else {
        return res.status(404).json({
          msg: "Note not found!",
        });
      }
    } else {
      let newJobNote = new notes({
        jobId,
        genralNotes,
        employeeNotes,
        customerNotes,
      });
      const savedNote = await newJobNote.save();
      return res.status(200).json({
        msg: "Data successfully created!",
        data: savedNote,
      });
    }
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      msg: "An error occurred while processing the request.",
      error: err.message,
    });
  }
};

exports.notesListByJobId = async (req, res) => {
  try {
    if (req) {
      const jobId = new ObjectId(req.query && req.query.jobId);
      const notesListByJobId = await notes.findOne({ jobId: jobId });
      res.json({
        notesListByJobId: notesListByJobId,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateJobNotes = async (req, res) => {
  try {
    const checkId = await notes.findById({ _id: req.body._id });
    if (checkId) {
      const editdata = await notes.findByIdAndUpdate(req.body._id, req.body, {
        new: true,
      });
      if (editdata) {
        res.status(200).send({
          msg: "edit data is Successfully",
          data: editdata,
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
};

/**
 * Get Job Schedule By ID (with Worker Access Control)
 * GET /api/jobs/:id
 */
exports.getJobScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    // EXEC-32: Assigned Worker Access Control
    if (req.user) {
      const isAuthorized = await isWorkerAssignedToJob(id, req.user?.userId, req.user?.role);
      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          code: 'ACCESS_DENIED',
          message: 'Access denied: You are not assigned to this job.',
        });
      }
    }

    const jobSchedule = await JobSchedule.findById(id).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('package').populate('services').populate({
      path: 'offer',
      populate: { path: 'customer' }
    }).populate({
      path: 'invoice',
      populate: { path: 'customer' }
    }).populate({
      path: 'materials',
      populate: {
        path: 'material',
        select: 'name'
      }
    }).lean();

    if (!jobSchedule) {
      return res.status(404).json({ message: 'Job schedule not found' });
    }

    // Query all invoices linked to this job to ensure fresh and complete invoices with customer populated
    const directInvoices = await Invoice.find({
      $or: [
        { _id: { $in: jobSchedule.invoice || [] } },
        { job: id }
      ]
    }).populate('customer').sort({ createdAt: -1 }).lean();
    if (directInvoices && directInvoices.length > 0) {
      jobSchedule.invoice = directInvoices;
    }

    // Query all offers linked to this job
    const directOffers = await Finance.find({
      $or: [
        { _id: { $in: jobSchedule.offer || [] } },
        { job: id }
      ]
    }).populate('customer').sort({ createdAt: -1 }).lean();
    if (directOffers && directOffers.length > 0) {
      jobSchedule.offer = directOffers;
    }

    const rooms = await ValuationRooms.find({ jobId: id })
      .select("roomId roomTypeName name furnitureType inventoryItems assembledItems dismantledItems storageItems")
      .lean();

    const allFurnitureList = await FurnitureType.find().select("_id furnitureTypeName isDisassambled").lean();
    const furnitureMap = new Map();
    allFurnitureList.forEach((f) => {
      furnitureMap.set(f._id.toString(), f.isDisassambled);
      if (f.furnitureTypeName) {
        furnitureMap.set(f.furnitureTypeName.trim().toLowerCase(), f.isDisassambled);
      }
    });

    const data = rooms.map(({ roomId, _id , ...rest }) => ({
      _id: roomId,
      ...rest,
      furnitureType: (rest.furnitureType || []).map((f) => ({
        ...f,
        isDisassambled: f.isDisassambled !== undefined
          ? f.isDisassambled
          : (furnitureMap.get(f._id?.toString()) ?? (f.furnitureTypeName ? furnitureMap.get(f.furnitureTypeName.trim().toLowerCase()) : false) ?? false),
      })),
    }));
    jobSchedule.rooms = data;

    res.status(200).json(jobSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve job schedule', error: error.message });
  }
};
