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
  const {
    username,
    email,
    password,
    role,
    access,
    gender,
    language,
    dob,
    telephone,
    postCode,
    houseNumber,
    addition,
    street,
    city,
    country,
    inservice,
    outofservice,
    trailPeriod,
    contract,
    drivingLicense,
    skills,
    documentNumber,
  } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }
    const bcryptSalt = bcrypt.genSaltSync(10);
    const hashedPassword = await bcrypt.hash(password, bcryptSalt);

    const isAdminRequester = req.user && req.user.role === 'Admin';
    const totalUsers = await User.countDocuments();
    const isFirstUserBootstrap = totalUsers === 0;

    let finalRole = 'Staff';
    let finalAccess = ['Dashboard'];

    if (isAdminRequester || isFirstUserBootstrap) {
      const allowedRoles = ['Admin', 'Staff', 'Agent', 'Driver'];
      finalRole = allowedRoles.includes(role) ? role : 'Staff';
      finalAccess = (Array.isArray(access) && access.length > 0)
        ? access
        : (finalRole === 'Admin' ? ALL_CRM_MODULES : ['Dashboard']);
    } else {
      if (role && role.toLowerCase() === 'admin') {
        return res.status(403).json({ msg: "Self-registration as Admin is forbidden." });
      }
      finalRole = 'Staff';
      finalAccess = ['Dashboard'];
    }

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: finalRole,
      access: finalAccess,
      gender: gender || undefined,
      language: language || undefined,
      dob: dob ? new Date(dob) : undefined,
      telephone: telephone || undefined,
      postCode: postCode || undefined,
      houseNumber: houseNumber || undefined,
      addition: addition || undefined,
      street: street || undefined,
      city: city || undefined,
      country: country || undefined,
      inservice: inservice ? new Date(inservice) : undefined,
      outofservice: outofservice ? new Date(outofservice) : undefined,
      trailPeriod: trailPeriod !== undefined && !isNaN(Number(trailPeriod)) ? Number(trailPeriod) : undefined,
      contract: contract || undefined,
      drivingLicense: Array.isArray(drivingLicense) ? drivingLicense : [],
      skills: Array.isArray(skills) ? skills : [],
      documentNumber: documentNumber || undefined,
      isActive: true,
      isRestricted: false,
    });
    await newUser.save();
    const userResponse = newUser.toObject();
    delete userResponse.password;
    return res.status(201).json({ msg: "User registered successfully", user: userResponse });
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
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('[loginUser] FATAL: JWT_SECRET environment variable is missing.');
      return res.status(500).json({ msg: "Server authentication configuration error." });
    }
    jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: "100h" },
      (err, token) => {
        if (err) {
          console.error('[loginUser jwt.sign error]', err);
          return res.status(500).json({ msg: "Server error", details: err.message });
        }
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
    console.error('[loginUser error]', err);
    return res.status(500).json({ msg: "Server error", details: err.message });
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
    const users = await User.find({}).select("-password");
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
    const user = await User.findByIdAndDelete(id).select("-password");
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const userObj = user.toObject ? user.toObject() : { ...(user._doc || user) };
    delete userObj.password;
    return res.status(200).json({ msg: "User deleted successfully", user: userObj });
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

  // Strict type check against NoSQL operator injection (e.g. { $ne: "" }, { $gt: "" })
  if (typeof email !== 'string' || (typeof otp !== 'string' && typeof otp !== 'number') || typeof newPassword !== 'string') {
    return res.status(400).json({ msg: "Invalid input format." });
  }

  const safeEmail = String(email).trim().toLowerCase();
  const safeOtp = String(otp).trim();
  const safeNewPassword = String(newPassword);

  if (!/^\d{6}$/.test(safeOtp)) {
    return res.status(400).json({ msg: "OTP must be a valid 6-digit number." });
  }

  try {
    const user = await User.findOne({ email: safeEmail });
    if (!user) {
      return res.status(404).json({ msg: "User not found" });
    }
    const emailDomain = (safeEmail || '').split('@')[1]?.toLowerCase();
    const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com', 'tempmail.com', 'guerrillamail.com', 'yopmail.com', 'trashmail.com'];
    if (DISPOSABLE_EMAIL_DOMAINS.includes(emailDomain)) {
      return res.status(403).json({ msg: "Password recovery is disabled for public disposable mailbox domains." });
    }
    if (user.isRestricted || user.isActive === false) {
      return res.status(403).json({ msg: "Password recovery is disabled for restricted accounts." });
    }
    const record = await Otp.findOne({ email: safeEmail, otp: safeOtp });
    if (record) {
      await Otp.deleteOne({ email: safeEmail }); // OTP can only be used once
    } else {
      return res.status(400).json({ msg: "Invalid or expired OTP" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedNewPassword = await bcrypt.hash(safeNewPassword, salt);
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
    const requesterId = String(req.user?.id || req.user?.userId || req.user?._id || req.user?.user?.id || req.user?.user?.userId || '');
    const isAdmin = req.user?.role === 'Admin';
    const rawTargetId = id || req.body._id || req.body.userId || requesterId;
    if (!rawTargetId) {
      return res.status(400).json({ msg: "User ID is required for update." });
    }
    const targetId = String(rawTargetId);

    // If caller is NOT Admin, they can only update their own profile
    if (!isAdmin && requesterId && targetId !== requesterId) {
      return res.status(403).json({ msg: "Forbidden: You can only update your own profile." });
    }

    const updatePayload = { ...req.body };
    delete updatePayload.id;
    delete updatePayload._id;
    delete updatePayload.userId;

    // Non-Admin privilege protection: cannot change role, access, active status, password, or email
    if (!isAdmin) {
      delete updatePayload.role;
      delete updatePayload.access;
      delete updatePayload.isActive;
      delete updatePayload.isRestricted;
      delete updatePayload.status;
      delete updatePayload.password;
      delete updatePayload.email;
    } else {
      // Do not overwrite password with empty/undefined string
      if (!updatePayload.password || typeof updatePayload.password !== 'string' || updatePayload.password.trim() === '') {
        delete updatePayload.password;
      } else {
        const bcryptSalt = bcrypt.genSaltSync(10);
        updatePayload.password = await bcrypt.hash(updatePayload.password, bcryptSalt);
      }
    }

    // Safely parse Date fields
    if (updatePayload.dob) {
      const d = new Date(updatePayload.dob);
      updatePayload.dob = isNaN(d.getTime()) ? null : d;
    }
    if (updatePayload.inservice) {
      const d = new Date(updatePayload.inservice);
      updatePayload.inservice = isNaN(d.getTime()) ? null : d;
    }
    if (updatePayload.outofservice) {
      const d = new Date(updatePayload.outofservice);
      updatePayload.outofservice = isNaN(d.getTime()) ? null : d;
    }
    if (updatePayload.contract && typeof updatePayload.contract === 'object') {
      if (updatePayload.contract.startDate) {
        const d = new Date(updatePayload.contract.startDate);
        updatePayload.contract.startDate = isNaN(d.getTime()) ? null : d;
      }
      if (updatePayload.contract.endDate) {
        const d = new Date(updatePayload.contract.endDate);
        updatePayload.contract.endDate = isNaN(d.getTime()) ? null : d;
      }
    }

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

    if (isActive !== undefined && isAdmin) {
      updatePayload.isActive = Boolean(isActive);
    }
    if (isRestricted !== undefined && isAdmin) {
      updatePayload.isRestricted = Boolean(isRestricted);
    }

    if (isAdmin) {
      if (role === 'Admin' && (!access || !Array.isArray(access) || access.length === 0)) {
        updatePayload.access = ALL_CRM_MODULES;
      } else if (Array.isArray(access)) {
        updatePayload.access = access;
      }
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
    delete updatedObj.password;
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
    ).select("-password");
    if (!updatedUser) {
      return res.status(404).json({ msg: "User not found." });
    }
    const userObj = updatedUser.toObject ? updatedUser.toObject() : { ...(updatedUser._doc || updatedUser) };
    delete userObj.password;
    return res
      .status(200)
      .json({ msg: "Admin role assign successfully.", user: userObj });
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
