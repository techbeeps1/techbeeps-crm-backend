const express = require("express");
const router = express.Router();
const {
  createActivity,
  getAllActivities,
  getActivityById,
  updateActivity,
  deleteActivity,
  clearAllActivities
} = require("../controllers/activityController");
const authMiddleware = require("../middlewares/authMiddlerware");
const roleMiddleware = require("../middlewares/roleMiddleware");

router.post("/", createActivity);

router.get("/", authMiddleware, getAllActivities);
router.get("/:id", authMiddleware, getActivityById);
router.put("/:id", authMiddleware, roleMiddleware(['Admin', 'Staff', 'Agent']), updateActivity);
router.delete("/:id", authMiddleware, roleMiddleware('Admin'), deleteActivity);
router.delete("/", authMiddleware, roleMiddleware('Admin'), clearAllActivities);

module.exports = router;
