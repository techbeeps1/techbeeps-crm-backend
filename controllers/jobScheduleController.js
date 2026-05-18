const JobSchedule = require("../models/jobSchedule");
const { ObjectId } = require("mongodb");
const Customer = require("../models/customer");
const notes = require("../models/job/notes");
const FinancialProcess = require("../models/job/financialProcess");
const Package = require('../models/PackageModel')

exports.jobSchedule = async (req, res) => {
  try {
    const { date, customer, package, load, unload, knownAddress } = req.body;
    const customerExists = await Customer.findById(customer);
    if (!customerExists) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    const packageExists = await Package.findById(package);
    if (!packageExists) {
      return res.status(404).json({ message: 'Package not found' });
    }
    const newJobSchedule = new JobSchedule({ date, customer, package, load, unload, knownAddress });
    const savedJobSchedule = await newJobSchedule.save();
    res.status(201).json(newJobSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create job schedule', error: error.message });
  }
};

exports.updateJobSchedule = async (req, res) => {
  try {
    const { id } = req.params; // Get the job schedule ID from the URL parameter
    const { date, customer, package, load, unload, knownAddress, status, offer, invoice } = req.body;

    const jobSchedule = await JobSchedule.findById(id);
    if (!jobSchedule) {
      return res.status(404).json({ message: 'Job schedule not found' });
    }
    jobSchedule.date = date || jobSchedule.date;
    jobSchedule.status = status || jobSchedule.status;
    jobSchedule.customer = customer || jobSchedule.customer;
    jobSchedule.package = package || jobSchedule.package;
    jobSchedule.load = load || jobSchedule.load;
    jobSchedule.unload = unload || jobSchedule.unload;
    jobSchedule.knownAddress = knownAddress || jobSchedule.knownAddress;
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
    console.error(error);
    res.status(500).json({ message: 'Failed to update job schedule', error: error.message });
  }
};


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
    const jobList = await JobSchedule.find(filter)
      .select('customer date status load unload') // Select only necessary fields
      .populate('customer', 'firstName lastName') // Populate only necessary fields in customer
      .lean(); // Converts documents to plain JS objects
    const optimizedJobList = jobList.map(job => ({
      ...job,
      load: {
        city: job?.load?.city,
        country: job?.load?.country
      },
      unload: {
        city: job?.unload?.city,
        country: job?.unload?.country
      }
    }));
    res.json({ jobList: optimizedJobList });
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
    if (req.query && req.query.searchTerm) {
      const searchTerm = req.query.searchTerm.toLowerCase();
      const jobList = await JobSchedule.find();

      const searchedJobs = await Promise.all(
        jobList.map(async (jobData) => {
          const selectedCustomer = await Customer.findById(
            jobData.selectedCustomer
          );
          if (selectedCustomer) {
            const selectedCustomerName =
              selectedCustomer.firstName.toLowerCase();
            jobData.convertedselectedCustomer = selectedCustomerName;
            return selectedCustomerName.includes(searchTerm) ? jobData : null;
          }
          return null;
        })
      );
      const filteredJobs = searchedJobs.filter((job) => job !== null);
      res.json(filteredJobs);
    } else {
      const jobList = await JobSchedule.find();
      res.json(jobList);
    }
  } catch (error) {
    console.error("Error fetching Jobs:", error);
  }
};

exports.jobListByCustomerId = async (req, res) => {
  try {
    const customerId = new ObjectId(req.query.customerId);
    const jobListByCustomerId = await JobSchedule.find({
      selectedCustomer: customerId,
    });
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

exports.updateFinancialProcess = async (req, res) => {
  try {
    const checkId = await FinancialProcess.findById({ _id: req.body._id });
    if (checkId) {
      const editdata = await FinancialProcess.findByIdAndUpdate(req.body._id, req.body, {
        new: true,
      });
      if (editdata) {
        res.status(200).send({
          msg: "edited data Successfully",
          data: editdata,
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
};

exports.financialProcessListByJobId = async (req, res) => {
  try {
    const jobId = new ObjectId(req.query.jobId);
    const financialProcessListByJobId = await FinancialProcess.find({ jobId: jobId });
    res.json({
      financialProcessListByJobId: financialProcessListByJobId,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getJobScheduleById = async (req, res) => {
  try {
    const { id } = req.params;
    const jobSchedule = await JobSchedule.findById(id).populate({
      path: 'customer',
      populate: {
        path: 'address',
        match: { addressType: 'head' },
      },
    }).populate('package').populate('offer').populate('invoice').populate({
      path: 'materials',
      populate: {
        path: 'material',
        select: 'name'
      }
    });
    if (!jobSchedule) {
      return res.status(404).json({ message: 'Job schedule not found' });
    }
    res.status(200).json(jobSchedule);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve job schedule', error: error.message });
  }
};

