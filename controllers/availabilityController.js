const Availability = require('../models/availabilityModel');
const User = require('../models/user');
const Employability = require('../models/employabilityModel');
const LeaveRequest = require('../models/LeaveRequest');

const DEFAULT_WEEKLY_SCHEDULE = {
  monday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  tuesday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  wednesday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  thursday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  friday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  saturday: { enabled: false, startTime: '08:00', endTime: '17:00' },
  sunday: { enabled: false, startTime: '08:00', endTime: '17:00' },
};

// Helper to calculate ISO week number
function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

// Helper to get day of week key (monday..sunday)
function getDayKey(dateObj) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dateObj.getDay()];
}

// 1. GET Availability for an employee
exports.getEmployeeAvailability = async (req, res) => {
  try {
    const { employeeId } = req.params;
    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    let availability = await Availability.findOne({ employeeId });

    if (!availability) {
      // Return default template
      return res.status(200).json({
        success: true,
        data: {
          employeeId,
          weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
          isBiWeeklyEnabled: false,
          evenWeekSchedule: DEFAULT_WEEKLY_SCHEDULE,
          oddWeekSchedule: DEFAULT_WEEKLY_SCHEDULE,
          sporadicExceptions: [],
          defaultDayStart: '08:00',
          defaultDayEnd: '19:00',
          isDefault: true,
        },
      });
    }

    res.status(200).json({
      success: true,
      data: availability,
    });
  } catch (error) {
    console.error('Error in getEmployeeAvailability:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// 2. PUT / Save Availability for an employee
exports.saveEmployeeAvailability = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const {
      weeklySchedule,
      isBiWeeklyEnabled,
      evenWeekSchedule,
      oddWeekSchedule,
      sporadicExceptions,
      defaultDayStart,
      defaultDayEnd,
      notes,
    } = req.body;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: 'Employee ID is required' });
    }

    const payload = {
      employeeId,
      weeklySchedule: weeklySchedule || DEFAULT_WEEKLY_SCHEDULE,
      isBiWeeklyEnabled: !!isBiWeeklyEnabled,
      evenWeekSchedule: evenWeekSchedule || DEFAULT_WEEKLY_SCHEDULE,
      oddWeekSchedule: oddWeekSchedule || DEFAULT_WEEKLY_SCHEDULE,
      defaultDayStart: defaultDayStart || '08:00',
      defaultDayEnd: defaultDayEnd || '19:00',
      notes: notes || '',
    };

    if (Array.isArray(sporadicExceptions)) {
      payload.sporadicExceptions = sporadicExceptions;
    }

    const updated = await Availability.findOneAndUpdate(
      { employeeId },
      { $set: payload },
      { new: true, upsert: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Employee availability updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Error in saveEmployeeAvailability:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// 3. POST Sporadic Exception
exports.addSporadicException = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date, type, startTime, endTime, reason } = req.body;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required for sporadic availability' });
    }

    let availability = await Availability.findOne({ employeeId });
    if (!availability) {
      availability = new Availability({
        employeeId,
        weeklySchedule: DEFAULT_WEEKLY_SCHEDULE,
        isBiWeeklyEnabled: false,
        evenWeekSchedule: DEFAULT_WEEKLY_SCHEDULE,
        oddWeekSchedule: DEFAULT_WEEKLY_SCHEDULE,
        sporadicExceptions: [],
      });
    }

    // Filter out existing exception on the same date if any
    availability.sporadicExceptions = availability.sporadicExceptions.filter(
      (e) => e.date !== date
    );

    availability.sporadicExceptions.push({
      date,
      type: type || 'available',
      startTime: startTime || '08:00',
      endTime: endTime || '17:00',
      reason: reason || '',
    });

    await availability.save();

    res.status(200).json({
      success: true,
      message: 'Sporadic availability added successfully',
      data: availability,
    });
  } catch (error) {
    console.error('Error in addSporadicException:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// 4. DELETE Sporadic Exception
exports.deleteSporadicException = async (req, res) => {
  try {
    const { employeeId, exceptionId } = req.params;

    const availability = await Availability.findOne({ employeeId });
    if (!availability) {
      return res.status(404).json({ success: false, message: 'Availability record not found' });
    }

    availability.sporadicExceptions = availability.sporadicExceptions.filter(
      (e) => e._id.toString() !== exceptionId && e.date !== exceptionId
    );

    await availability.save();

    res.status(200).json({
      success: true,
      message: 'Sporadic availability removed successfully',
      data: availability,
    });
  } catch (error) {
    console.error('Error in deleteSporadicException:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Export helpers for use in other controllers (like Allemployees)
exports.DEFAULT_WEEKLY_SCHEDULE = DEFAULT_WEEKLY_SCHEDULE;
exports.getISOWeekNumber = getISOWeekNumber;
exports.getDayKey = getDayKey;
