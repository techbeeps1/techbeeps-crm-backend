const Vehicle = require('../../models/Resources/vehicle');

const cleanVehiclePayload = (data) => {
  const cleaned = { ...data };

  // Convert empty date strings to null to prevent Mongoose CastErrors
  if (cleaned.purchasingDate === '' || cleaned.purchasingDate === undefined) {
    cleaned.purchasingDate = null;
  }
  if (cleaned.maintenance) {
    cleaned.maintenance = { ...cleaned.maintenance };
    if (cleaned.maintenance.nextInspection === '' || cleaned.maintenance.nextInspection === undefined) {
      cleaned.maintenance.nextInspection = null;
    }
    if (cleaned.maintenance.maintenanceRequired === '' || cleaned.maintenance.maintenanceRequired === undefined) {
      cleaned.maintenance.maintenanceRequired = null;
    }
  }

  // Convert numeric fields properly if provided (keep contents as text/mixed for passengers or custom text)
  const numberFields = ['pricePerKilometer', 'pricePerHour', 'floors', 'length', 'width', 'height', 'tailLiftLength', 'drawWeight'];
  numberFields.forEach((field) => {
    if (cleaned[field] !== undefined && cleaned[field] !== null && cleaned[field] !== '') {
      cleaned[field] = Number(cleaned[field]) || 0;
    }
  });

  return cleaned;
};

// Create a new vehicle
exports.createVehicle = async (req, res) => {
  try {
    const cleanedData = cleanVehiclePayload(req.body);
    const vehicle = new Vehicle(cleanedData);
    const savedVehicle = await vehicle.save();
    res.status(201).json(savedVehicle);
  } catch (error) {
    console.error("Error creating vehicle:", error);
    res.status(400).json({ message: error.message });
  }
};

// Get all vehicles (return full vehicle details, sorted newest first)
exports.getAllVehicles = async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ createdAt: -1 });
    res.status(200).json(vehicles);
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    res.status(500).json({ message: error.message });
  }
};

// Get a single vehicle by ID
exports.getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.status(200).json(vehicle);
  } catch (error) {
    console.error("Error fetching vehicle by ID:", error);
    res.status(500).json({ message: error.message });
  }
};

// Update a vehicle by ID
exports.updateVehicleById = async (req, res) => {
  try {
    const cleanedData = cleanVehiclePayload(req.body);
    const updatedVehicle = await Vehicle.findByIdAndUpdate(req.params.id, cleanedData, { new: true, runValidators: true });
    if (!updatedVehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.status(200).json(updatedVehicle);
  } catch (error) {
    console.error("Error updating vehicle:", error);
    res.status(400).json({ message: error.message });
  }
};

// Delete a vehicle by ID
exports.deleteVehicleById = async (req, res) => {
  try {
    const deletedVehicle = await Vehicle.findByIdAndDelete(req.params.id);
    if (!deletedVehicle) return res.status(404).json({ message: "Vehicle not found" });
    res.status(200).json({ message: "Vehicle deleted successfully" });
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    res.status(500).json({ message: error.message });
  }
};
