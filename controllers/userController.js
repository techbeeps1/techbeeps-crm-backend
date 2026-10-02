require("dotenv").config();
const User = require("../models/user");
const Employability = require("../models/employabilityModel");
const Availability = require("../models/availabilityModel");
const LeaveRequest = require("../models/LeaveRequest");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Otp = require("../models/otpModel");
const Vehicle = require('../models/Resources/vehicle');
const Appointment = require('../models/appointmentModel');

const ALL_CRM_MODULES = [
  'Dashboard',
  'Work',
  'Leads',
  'Customer',
  'Jobs',
  'Planning',
  'Finance',
  'Tasks',
  'Resources',
  'HRM',
  'Communication',
  'Settings',
  'Features',
  'Profile',
  'Notifications'
];

const registerUser = async (req, res) => {
  const { username, email, password, role, access } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }
    const bcryptSalt = bcrypt.genSaltSync(10);
    const hashedPassword = await bcrypt.hash(password, bcryptSalt);

    let assignedAccess = access;
    if (!assignedAccess || !Array.isArray(assignedAccess) || assignedAccess.length === 0) {
      assignedAccess = role === 'Admin' ? ALL_CRM_MODULES : ['Dashboard'];
    }

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || "Staff",
      access: assignedAccess,
    });
    await newUser.save();
    return res.status(201).json({ msg: "User registered successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }
    if (user.isActive === false || user.isRestricted === true) {
      return res.status(403).json({ msg: "This account has been deactivated or restricted by administrator." });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid Credentials" });
    }
    const userAccess = (user.role === 'Admin' && (!user.access || user.access.length === 0))
      ? ALL_CRM_MODULES
      : (user.access || ['Dashboard']);

    const payload = {
      user: {
        id: user._id,
        userId: user._id,
        role: user.role,
        access: userAccess,
        username: user.username,
      },
      userId: user._id,
      id: user._id,
      role: user.role,
      access: userAccess,
      username: user.username,
    };
    jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { expiresIn: "100h" },
      (err, token) => {
        if (err) throw err;
        const userObj = user.toObject ? user.toObject() : { ...(user._doc || user) };
        delete userObj.password;
        userObj.id = user._id;
        userObj._id = user._id;
        userObj.userId = user._id;
        userObj.role = user.role;
        userObj.access = userAccess;

        return res.json({
          token,
          role: user.role,
          access: userAccess,
          user: userObj
        });
      }
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error" });
  }
};

const ProfileUser = async (req, res) => {
  try {
    const targetId = req.user?.id || req.user?.userId || req.user?.user?.id || req.user?.user?.userId;
    const user = await User.findById(targetId).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const userObj = user.toObject ? user.toObject() : { ...(user._doc || user) };
    userObj.id = user._id;
    userObj._id = user._id;
    userObj.userId = user._id;
    return res.json({
      ...userObj,
      user: userObj,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error" });
  }
};

const Allusers = async (req, res) => {
  try {
    const users = await User.find(
      {},
      {
        id: 1,
        username: 1,
        email: 1,
        role: 1,
        access: 1,
        drivingLicense: 1,
        skills: 1,
        isActive: 1,
        isRestricted: 1,
        telephone: 1,
        country: 1,
        gender: 1,
        dob: 1,
        postCode: 1,
        houseNumber: 1,
        addition: 1,
        street: 1,
        city: 1,
        inservice: 1,
        outofservice: 1,
        trailPeriod: 1,
        contract: 1,
        documentNumber: 1,
      }
    );
    if (!users || users.length === 0) {
      return res.status(404).json({ msg: "Users not found" });
    }
    return res.status(200).json(users);
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: "Server error" });
  }
};

const DEFAULT_WEEKLY_SCHEDULE = {
  monday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  tuesday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  wednesday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  thursday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  friday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  saturday: { enabled: true, startTime: '08:00', endTime: '17:00' },
  sunday: { enabled: false, startTime: '08:00', endTime: '17:00' },
};

function getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function getDayKey(dateObj) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[dateObj.getUTCDay()];
}

function getFreeSlots(jobStart, jobEnd, bookings) {
  const freeSlots = [];

  // Sort bookings by start time
  bookings.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  let current = new Date(jobStart);

  for (const booking of bookings) {
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);

    // Ignore booking outside job timing
    if (end <= jobStart || start >= jobEnd) continue;

    const bookingStart = start < jobStart ? jobStart : start;
    const bookingEnd = end > jobEnd ? jobEnd : end;

    // Gap found
    if (bookingStart > current) {
      freeSlots.push({
        start: new Date(current),
        end: new Date(bookingStart),
      });
    }

    if (bookingEnd > current) {
      current = bookingEnd;
    }
  }

  // Last gap
  if (current < jobEnd) {
    freeSlots.push({
      start: new Date(current),
      end: new Date(jobEnd),
    });
  }

  return freeSlots;
}

function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

const Allemployees = async (req, res) => {
  try {
    const { date } = req.params;
    const { excludeAppointmentId } = req.query;

    let excludedEmployabilityIds = [];
    if (excludeAppointmentId && excludeAppointmentId !== 'undefined' && excludeAppointmentId !== 'null') {
      try {
        const existingAppt = await Appointment.findById(excludeAppointmentId);
        if (existingAppt && Array.isArray(existingAppt.assignedEmployees)) {
          excludedEmployabilityIds = existingAppt.assignedEmployees.map((id) => String(id));
        }
      } catch (err) {
        console.error('Error fetching excluded appointment:', err);
      }
    }

    // Parse date parts to avoid timezone shifting
    const [yearStr, monthStr, dayStr] = date.split('-');
    const targetDate = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, parseInt(dayStr, 10)));
    const dayKey = getDayKey(targetDate);
    const isoWeek = getISOWeekNumber(targetDate);
    const isEvenWeek = isoWeek % 2 === 0;

    const users = await User.find(
      {},
      {
        username: 1,
        role: 1,
        skills: 1,
      }
    );

    const result = await Promise.all(
      users.map(async (user) => {
        // 1. Fetch employee's availability configuration
        const avail = await Availability.findOne({ employeeId: user._id });

        let isDayActive = true;
        let workingStartTime = '08:00';
        let workingEndTime = '17:00';

        // 2. Check for Sporadic Exception on this specific date
        const sporadic = (avail?.sporadicExceptions || []).find((e) => e.date === date);

        if (sporadic) {
          if (sporadic.type === 'unavailable') {
            return {
              _id: user._id,
              username: user.username,
              role: user.role,
              skills: user.skills,
              available: false,
              freeSlots: [],
            };
          } else {
            workingStartTime = sporadic.startTime || '08:00';
            workingEndTime = sporadic.endTime || '17:00';
            isDayActive = true;
          }
        } else {
          // 3. Use Weekly / Bi-Weekly Schedule
          let daySchedule;
          if (avail?.isBiWeeklyEnabled) {
            const activeWeekSchedule = isEvenWeek
              ? (avail.evenWeekSchedule || DEFAULT_WEEKLY_SCHEDULE)
              : (avail.oddWeekSchedule || DEFAULT_WEEKLY_SCHEDULE);
            daySchedule = activeWeekSchedule?.[dayKey] || DEFAULT_WEEKLY_SCHEDULE[dayKey];
          } else if (avail?.weeklySchedule) {
            daySchedule = avail.weeklySchedule[dayKey] || DEFAULT_WEEKLY_SCHEDULE[dayKey];
          } else {
            daySchedule = DEFAULT_WEEKLY_SCHEDULE[dayKey];
          }

          if (!daySchedule || daySchedule.enabled === false) {
            return {
              _id: user._id,
              username: user.username,
              role: user.role,
              skills: user.skills,
              available: false,
              freeSlots: [],
            };
          }

          workingStartTime = daySchedule.startTime || '08:00';
          workingEndTime = daySchedule.endTime || '17:00';
        }

        // 4. Check Approved Leave Requests
        const dayStartObj = new Date(`${date}T00:00:00.000Z`);
        const dayEndObj = new Date(`${date}T23:59:59.999Z`);
        const approvedLeaves = await LeaveRequest.find({
          employeeId: user._id,
          status: 'Approved',
          startDate: { $lte: dayEndObj },
          endDate: { $gte: dayStartObj },
        });

        if (approvedLeaves && approvedLeaves.length > 0) {
          const fullDayLeave = approvedLeaves.find(
            (l) => l.durationType === 'Full Day' || l.durationType === 'Multiple Days' || !l.durationType
          );
          if (fullDayLeave) {
            return {
              _id: user._id,
              username: user.username,
              role: user.role,
              skills: user.skills,
              available: false,
              freeSlots: [],
            };
          }

          const firstHalfLeave = approvedLeaves.find((l) => l.durationType === 'Half Day - First Half');
          const secondHalfLeave = approvedLeaves.find((l) => l.durationType === 'Half Day - Second Half');

          if (firstHalfLeave && workingStartTime < '13:00') {
            workingStartTime = '13:00';
          }
          if (secondHalfLeave && workingEndTime > '13:00') {
            workingEndTime = '13:00';
          }
        }

        const jobStart = new Date(`${date}T${workingStartTime}:00.000Z`);
        const jobEnd = new Date(`${date}T${workingEndTime}:00.000Z`);

        if (jobEnd <= jobStart) {
          return {
            _id: user._id,
            username: user.username,
            role: user.role,
            skills: user.skills,
            available: false,
            freeSlots: [],
          };
        }

        // 5. Check overlapping appointments / Employability bookings
        const bookingQuery = {
          employeeId: user._id,
          startTime: { $lt: jobEnd },
          endTime: { $gt: jobStart },
        };
        if (excludedEmployabilityIds.length > 0) {
          bookingQuery._id = { $nin: excludedEmployabilityIds };
        }

        const bookings = await Employability.find(bookingQuery).sort({ startTime: 1 });

        const freeSlots = getFreeSlots(jobStart, jobEnd, bookings);

        return {
          _id: user._id,
          username: user.username,
          role: user.role,
          skills: user.skills,
          available: freeSlots.length > 0,
          freeSlots: freeSlots.map((slot) => ({
            start: formatTime(slot.start),
            end: formatTime(slot.end),
          })),
        };
      })
    );

    // Fetch all vehicles
    const allVehicles = await Vehicle.find(
      {},
      {
        name: 1,
        licensePlate: 1,
        vehicleType: 1,
        model: 1,
      }
    ).sort({ name: 1 });

    // Calculate assigned vehicles and bookings for that date
    const dayStartCheck = new Date(`${date}T00:00:00.000Z`);
    const dayEndCheck = new Date(`${date}T23:59:59.999Z`);

    const assignedVehiclesQuery = {
      startTime: { $lt: dayEndCheck },
      endTime: { $gt: dayStartCheck },
      vehicle: { $ne: null },
    };
    if (excludedEmployabilityIds.length > 0) {
      assignedVehiclesQuery._id = { $nin: excludedEmployabilityIds };
    }

    const assignedVehicles = await Employability.find(
      assignedVehiclesQuery,
      { vehicle: 1, startTime: 1, endTime: 1, employeeName: 1 }
    );

    const assignedAppointmentsQuery = {
      $or: [
        { startTime: { $lt: dayEndCheck }, endTime: { $gt: dayStartCheck } },
        { date: { $gte: dayStartCheck, $lte: dayEndCheck } },
      ],
      vehicle: { $ne: null },
    };
    if (excludeAppointmentId && excludeAppointmentId !== 'undefined' && excludeAppointmentId !== 'null') {
      try {
        assignedAppointmentsQuery._id = { $ne: excludeAppointmentId };
      } catch (e) {}
    }

    const assignedAppointments = await Appointment.find(
      assignedAppointmentsQuery,
      { _id: 1, vehicle: 1, startTime: 1, endTime: 1 }
    );

    const vehicleBookings = [];
    assignedVehicles.forEach((b) => {
      const vId = b.vehicle?._id || b.vehicle;
      if (vId) {
        vehicleBookings.push({
          vehicleId: String(vId),
          rawStartTime: b.startTime,
          rawEndTime: b.endTime,
          startTime: formatTime(b.startTime),
          endTime: formatTime(b.endTime),
          employeeName: b.employeeName || '',
        });
      }
    });

    assignedAppointments.forEach((b) => {
      const vId = b.vehicle?._id || b.vehicle;
      if (vId) {
        vehicleBookings.push({
          appointmentId: String(b._id),
          vehicleId: String(vId),
          rawStartTime: b.startTime,
          rawEndTime: b.endTime,
          startTime: formatTime(b.startTime),
          endTime: formatTime(b.endTime),
        });
      }
    });

    res.json({
      employees: result,
      vehicles: allVehicles,
      allVehicles,
      vehicleBookings,
    });
  } catch (err) {
    console.error('Error in Allemployees:', err);
    res.status(500).json({ msg: "Server Error" });
  }
};

const DeleteUser = async (req, res) => {
  const { id } = req.body; // Extract the user ID from the request body
  if (!id) {
    return res.status(400).json({ msg: "User ID is required" }); // Handle missing ID
  }
  try {
    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    return res.status(200).json({ msg: "User deleted successfully", user });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: "Server error" }); // Handle server errors
  }
};

const ResetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json({ msg: "Email, OTP, and new password are required" });
  }
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const emailDomain = (email || '').split('@')[1]?.toLowerCase();
    const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
    if (DISPOSABLE_EMAIL_DOMAINS.includes(emailDomain)) {
      return res.status(403).json({ msg: "Password recovery is disabled for public disposable mailbox domains." });
    }
    if (user.isRestricted || user.isActive === false) {
      return res.status(403).json({ msg: "Password recovery is disabled for restricted accounts." });
    }
    const record = await Otp.findOne({ email, otp });
    if (record) {
      await Otp.deleteOne({ email }); // OTP can only be used once
    } else {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedNewPassword;
    await user.save();
    return res.status(200).json({ msg: "Password updated successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error" });
  }
};
const UpdateDetails = async (req, res) => {
  const { id, access, role, status, isActive, isRestricted } = req.body;
  try {
    const targetId = id || req.body._id || req.body.userId || req.user?.id || req.user?.userId || req.user?.user?.id || req.user?.user?.userId;
    if (!targetId) {
      return res.status(400).json({ msg: "User ID is required for update." });
    }

    const updatePayload = { ...req.body };
    delete updatePayload.id;
    delete updatePayload._id;
    delete updatePayload.userId;

    // Handle status shorthand if provided ('active', 'deactive', 'inactive', 'restricted')
    if (status !== undefined) {
      const s = String(status).toLowerCase();
      if (s === 'active') {
        updatePayload.isActive = true;
        updatePayload.isRestricted = false;
      } else if (s === 'deactive' || s === 'inactive') {
        updatePayload.isActive = false;
        updatePayload.isRestricted = false;
      } else if (s === 'restricted') {
        updatePayload.isActive = false;
        updatePayload.isRestricted = true;
      }
      delete updatePayload.status;
    }

    if (isActive !== undefined) {
      updatePayload.isActive = Boolean(isActive);
    }
    if (isRestricted !== undefined) {
      updatePayload.isRestricted = Boolean(isRestricted);
    }

    if (role === 'Admin' && (!access || !Array.isArray(access) || access.length === 0)) {
      updatePayload.access = ALL_CRM_MODULES;
    } else if (Array.isArray(access)) {
      updatePayload.access = access;
    }

    const updatedUser = await User.findByIdAndUpdate(
      targetId,
      updatePayload,
      { new: true, runValidators: true },
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ msg: "User not found." });
    }

    const updatedObj = updatedUser.toObject ? updatedUser.toObject() : { ...(updatedUser._doc || updatedUser) };
    updatedObj.id = updatedUser._id;
    updatedObj._id = updatedUser._id;
    updatedObj.userId = updatedUser._id;

    return res
      .status(200)
      .json({ msg: "Employee updated successfully.", user: updatedObj, ...updatedObj });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Server error" });
  }
};
const MakeAdmin = async (req, res) => {
  const { id, role } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { role },
      { new: true, runValidators: true },
    );
    if (!updatedUser) {
      return res.status(404).json({ msg: "User not found." });
    }
    return res
      .status(200)
      .json({ msg: "Admin role assign successfully.", user: updatedUser });
  } catch (err) {
    console.error(err); // Log the error for debugging
    return res.status(500).json({ msg: "Server error" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  ProfileUser,
  Allusers,
  DeleteUser,
  ResetPassword,
  UpdateDetails,
  MakeAdmin,
  Allemployees,
};
