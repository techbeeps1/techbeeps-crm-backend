const Activity = require("../models/activityModel");

// Create a new activity
exports.createActivity = async (req, res) => {
  try {
    const activity = new Activity(req.body);
    const savedActivity = await activity.save();
    res.status(201).json('activity created');
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all activities
exports.getAllActivities = async (req, res) => {
    const { offer } = req.query;
  try {
    const filter = offer ? { offer } : {};
    const activities = await Activity.find(filter).sort({ date: -1 }); // Sort by date descending
    res.status(200).json(activities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a specific activity by ID
exports.getActivityById = async (req, res) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.status(200).json(activity);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update an activity
exports.updateActivity = async (req, res) => {
  try {
    const updatedActivity = await Activity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedActivity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.status(200).json(updatedActivity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete an activity
exports.deleteActivity = async (req, res) => {
  try {
    const deletedActivity = await Activity.findByIdAndDelete(req.params.id);
    if (!deletedActivity) {
      return res.status(404).json({ message: "Activity not found" });
    }
    res.status(200).json({ message: "Activity deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Clear all activities
exports.clearAllActivities = async (req, res) => {
  try {
    const result = await Activity.deleteMany({});
    res.status(200).json({
      message: "All activities have been cleared successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

