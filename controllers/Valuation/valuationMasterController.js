const mongoose = require("mongoose");
const JobSchedule = require("../../models/jobSchedule");
const Customer = require("../../models/customer");
const Package = require("../../models/PackageModel");
const Notes = require("../../models/job/notes");
const Finance = require("../../models/finance");
const ValuationRooms = require("../../models/Valuation/valuationRoomDetail");
const { validatePhoneNumber } = require("../../utils/phoneValidator");

exports.valuationMaster = async (req, res) => {
  try {
    const {
      customer,
      package,
      load,
      unload,
      knownAddress,
      relocation,
      materials,
      notes,
      offer,
      rooms,
      jobId,
      signWithCustomer,
      sendImmediately,
      services
    } = req.body;
    let job;

    if (customer) {
      if (customer.mobile && !validatePhoneNumber(customer.mobile)) {
        return res.status(400).json({ error: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).' });
      }
      if (customer.contact && !validatePhoneNumber(customer.contact)) {
        return res.status(400).json({ error: 'Please enter a valid telephone number (e.g. 010 1234567 or +31 10 1234567).' });
      }
    }

    // 1️⃣ **Check if Job Exists or Create New**

    const sanitizeCustomerPayload = (cust) => {
      if (!cust || typeof cust !== 'object') return {};
      const payload = { ...cust };
      delete payload._id;
      delete payload.__v;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.customerIndex;
      delete payload.customerId;
      if (Array.isArray(payload.address)) {
        payload.address = payload.address.filter(id => id && mongoose.Types.ObjectId.isValid(id));
      } else {
        delete payload.address;
      }
      return payload;
    };

    let customerExists;
    const targetCustomerId = customer?._id || customer?.customerId;
    if (targetCustomerId && mongoose.Types.ObjectId.isValid(targetCustomerId)) {
      customerExists = await Customer.findById(targetCustomerId);

      if (customerExists) {
        customerExists = await Customer.findByIdAndUpdate(
          customerExists._id,
          { $set: sanitizeCustomerPayload(customer) },
          { new: true },
        );
      } else if (customer?.email) {
        customerExists = await Customer.findOne({
          email: customer.email,
        });

        if (!customerExists) {
          customerExists = await Customer.create(sanitizeCustomerPayload(customer));
        } else {
          customerExists = await Customer.findByIdAndUpdate(
            customerExists._id,
            { $set: sanitizeCustomerPayload(customer) },
            { new: true },
          );
        }
      }
    } else if (customer?.email) {
      customerExists = await Customer.findOne({
        email: customer.email,
      });

      if (customerExists) {
        customerExists = await Customer.findByIdAndUpdate(
          customerExists._id,
          { $set: sanitizeCustomerPayload(customer) },
          { new: true },
        );
      } else {
        customerExists = await Customer.create(sanitizeCustomerPayload(customer));
      }
    }

    const isSendImmediately = sendImmediately === true || sendImmediately === "true";
    const isSignWithCustomer = signWithCustomer === true || signWithCustomer === "true";

    let jobStatus = "Pending";
    if (isSignWithCustomer) {
      jobStatus = "Processing";
    } else if (isSendImmediately) {
      jobStatus = "Pending";
    } else {
      jobStatus = "Draft";
    }

    const quoteStatus = isSignWithCustomer
      ? "Accepted"
      : isSendImmediately
        ? "Sent"
        : "Draft";

    if (!customerExists) {
      if (customer && (customer.firstName || customer.name || customer.email || customer.mobile || customer.phone)) {
        customerExists = await Customer.create(sanitizeCustomerPayload(customer));
      }
    }

    if (!customerExists && !jobId) {
      return res.status(400).json({ error: "A valid customer is required to create a job." });
    }

    if (jobId && mongoose.Types.ObjectId.isValid(jobId)) {
      job = await JobSchedule.findById(jobId);
      if (!job) {
        if (!customerExists) {
          return res.status(400).json({ error: "Customer is required to create a job schedule." });
        }
        job = await JobSchedule.create({ customer: customerExists._id, status: jobStatus });
      }
    } else {
      if (!customerExists) {
        return res.status(400).json({ error: "Customer is required to create a job schedule." });
      }
      job = await JobSchedule.create({ customer: customerExists._id, status: jobStatus });
    }

    // 2️⃣ **Check if Customer Exists or Create New**

    // 3️⃣ **Check if Package Exists** (optional — skip gracefully if not provided or empty)
    let packageExists = null;
    if (package && mongoose.Types.ObjectId.isValid(package)) {
      packageExists = await Package.findById(package);
    }
    const resolvedPackageId = packageExists ? packageExists._id : null;

    // 4️⃣ **Handle Offers (Array of Offers)** update or create idempotently
    let finance;
    if (customerExists) {
      const sanitizeOfferPayload = (off) => {
        if (!off || typeof off !== 'object') return {};
        const payload = { ...off };
        if (!payload._id || !mongoose.Types.ObjectId.isValid(payload._id)) {
          delete payload._id;
        }
        return payload;
      };

      const offerPayload = sanitizeOfferPayload(offer);
      const validOfferId = offer?._id && mongoose.Types.ObjectId.isValid(offer._id) ? offer._id : null;

      if (validOfferId) {
        finance = await Finance.findByIdAndUpdate(
          validOfferId,
          {
            ...offerPayload,
            customer: customerExists._id,
            package: resolvedPackageId,
            Status: quoteStatus,
          },
          { new: true },
        );
      } else {
        // Idempotent retry: check if a Finance quote already exists for this job
        finance = await Finance.findOne({ job: job._id });
        if (finance) {
          finance = await Finance.findByIdAndUpdate(
            finance._id,
            {
              ...offerPayload,
              customer: customerExists._id,
              package: resolvedPackageId,
              Status: quoteStatus,
            },
            { new: true },
          );
        } else {
          finance = await Finance.create({
            ...offerPayload,
            customer: customerExists._id,
            package: resolvedPackageId,
            job: job._id,
            Status: quoteStatus,
          });
        }
      }
    }

    // 5️⃣ **Check if Notes Exist and Update or Create**
    let freeText;
    const validNotesId = notes?._id && mongoose.Types.ObjectId.isValid(notes._id) ? notes._id : null;
    const sanitizedNotes = { ...notes };
    if (!validNotesId) {
      delete sanitizedNotes._id;
    }

    if (validNotesId) {
      freeText = await Notes.findByIdAndUpdate(validNotesId, sanitizedNotes, { new: true });
    } else {
      // Idempotent retry: check if notes already exist for this job
      freeText = await Notes.findOne({ jobId: job._id });
      if (freeText) {
        freeText = await Notes.findByIdAndUpdate(freeText._id, sanitizedNotes, { new: true });
      } else {
        freeText = await Notes.create({ ...sanitizedNotes, jobId: job._id });
      }
    }

    // 6️⃣ **Handle Relocation Details (if applicable)**

    let relocationDetails = job.relocation || {};

    relocationDetails = { ...relocation };

    // 7️⃣ **Handle Rooms and Materials**
    let valuationRoomsData =
      rooms?.map((room) => ({
        ...room,
        jobId: job._id,
      })) || [];

    let materialData =
      materials?.map((material) => ({
        ...material,
      })) || [];

    // 8️⃣ **Update JobSchedule**
    if (customerExists) job.customer = customerExists._id;
    job.status = jobStatus;
    job.package = resolvedPackageId || undefined;
    job.load = load || job.load;
    job.unload = unload || job.unload;
    job.knownAddress = knownAddress ?? job.knownAddress;
    job.relocation = relocationDetails;
    if (Array.isArray(materials)) {
      job.materials = materials
        .filter(m => m && m.material && mongoose.Types.ObjectId.isValid(m.material) && Number(m.quantity) > 0)
        .map(m => ({ material: m.material, quantity: Number(m.quantity) }));
    }
    if (Array.isArray(services)) {
      job.services = services.filter(s => s && mongoose.Types.ObjectId.isValid(s));
    }
    if (finance && finance._id) {
      if (!Array.isArray(job.offer)) {
        job.offer = [finance._id];
      } else if (!job.offer.some((id) => id && id.toString() === finance._id.toString())) {
        job.offer.push(finance._id);
      }
    }

    // 9️⃣ **Save Valuation Rooms**
    try {

      await ValuationRooms.deleteMany({
            jobId: job._id,
         });

      if (valuationRoomsData.length) {
        await ValuationRooms.insertMany(valuationRoomsData, { ordered: false });
      }
    } catch (error) {
      console.error("Error inserting valuation rooms:", error);
      return res
        .status(500)
        .json({
          message: "Error inserting valuation rooms",
          error: error.message,
        });
    }

    await job.save();
    return res.status(200).json({
      finance,
      job,
      customer: customerExists,
      message: "Job schedule successfully updated",
    });
  } catch (error) {
    console.error("Error in valuationMaster:", error);

    // duplicate email error
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(400).json({
        message: "Customer email already exists",
      });
    }

    return res.status(500).json({
      message: "Something went wrong",
      error: error.message,
    });
  }
};

exports.allValuationsRooms = async (req, res) => {
  try {
    const { jobId } = req.query;
    const filter = jobId ? { jobId } : {}; // If jobId is provided, filter by jobId, else return all rooms
    const rooms = await ValuationRooms.find(filter);
    if (rooms.length === 0) {
      return res.status(404).json({ message: "No rooms found" });
    }
    res.status(200).json(rooms);
  } catch (error) {
    console.error("Error fetching valuation rooms:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};

exports.deleteAllValuationsRooms = async (req, res) => {
  try {
    const result = await ValuationRooms.deleteMany();
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "No rooms found to delete" });
    }
    res.status(200).json({
      message: `${result.deletedCount} rooms deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting valuation rooms:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
};
