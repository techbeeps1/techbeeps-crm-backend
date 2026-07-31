const JobSchedule = require("../../models/jobSchedule");
const Customer = require("../../models/customer");
const Package = require("../../models/PackageModel");
const Notes = require("../../models/job/notes");
const Finance = require("../../models/finance");
const ValuationRooms = require("../../models/Valuation/valuationRoomDetail");

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

    // 1️⃣ **Check if Job Exists or Create New**

    let customerExists;
    if (customer?._id) {
      customerExists = await Customer.findById(customer._id);

      if (customerExists) {
        customerExists = await Customer.findByIdAndUpdate(
          customer._id,
          customer,
          { new: true },
        );
      } else {
        customerExists = await Customer.findOne({
          email: customer.email,
        });

        if (!customerExists) {
          customerExists = await Customer.create(customer);
        }
      }
    } else {
      customerExists = await Customer.findOne({
        email: customer.email,
      });

      if (customerExists) {
        customerExists = await Customer.findByIdAndUpdate(
          customerExists._id,
          customer,
          { new: true },
        );
      } else {
        customerExists = await Customer.create(customer);
      }
    }
    if (jobId) {
      job = await JobSchedule.findById(jobId);
      if (!job) {
        job = await JobSchedule.create({ status: "execution" });
      }
    } else {
      job = await JobSchedule.create({ status: "execution" });
    }

    // 2️⃣ **Check if Customer Exists or Create New**

    // 3️⃣ **Check if Package Exists**
    let packageExists = await Package.findById(package);
    if (!packageExists) {
      return res.status(404).json({ message: "Package not found" });
    }

    // 4️⃣ **Handle Offers (Array of Offers)** update  or create
    let finance;
    if (offer?._id) {
      finance = await Finance.findByIdAndUpdate(
        offer._id,
        {
          ...offer,
          customer: customerExists._id,
          package: package,
          Status: signWithCustomer
            ? "Accepted"
            : sendImmediately
              ? "Sent"
              : "Draft",
        },
        { new: true },
      );
    } else {
      finance = await Finance.create({
        ...offer,
        customer: customerExists._id,
        package: package,
        job: job._id,
        Status: signWithCustomer
          ? "Accepted"
          : sendImmediately
            ? "Sent"
            : "Draft",
      });
    }

    // 5️⃣ **Check if Notes Exist and Update or Create**
    let freeText;
    if (notes?._id) {
      freeText = await Notes.findByIdAndUpdate(notes._id, notes, { new: true });
    } else {
      freeText = await Notes.create({ ...notes, jobId: job._id });
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
    job.customer = customerExists._id;
    job.status = "execution";
    job.package = packageExists._id;
    job.load = load || job.load;
    job.unload = unload || job.unload;
    job.knownAddress = knownAddress ?? job.knownAddress;
    job.relocation = relocationDetails;
    job.materials = materialData;
    job.services = services || job.services;
    job.offer = finance._id;

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
