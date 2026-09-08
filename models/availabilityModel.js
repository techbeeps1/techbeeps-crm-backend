const mongoose = require('mongoose');

const dayScheduleSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  startTime: { type: String, default: '08:00' },
  endTime: { type: String, default: '17:00' },
}, { _id: false });

const weekDaysSchema = new mongoose.Schema({
  monday: { type: dayScheduleSchema, default: () => ({ enabled: true, startTime: '08:00', endTime: '17:00' }) },
  tuesday: { type: dayScheduleSchema, default: () => ({ enabled: true, startTime: '08:00', endTime: '17:00' }) },
  wednesday: { type: dayScheduleSchema, default: () => ({ enabled: true, startTime: '08:00', endTime: '17:00' }) },
  thursday: { type: dayScheduleSchema, default: () => ({ enabled: true, startTime: '08:00', endTime: '17:00' }) },
  friday: { type: dayScheduleSchema, default: () => ({ enabled: true, startTime: '08:00', endTime: '17:00' }) },
  saturday: { type: dayScheduleSchema, default: () => ({ enabled: false, startTime: '08:00', endTime: '17:00' }) },
  sunday: { type: dayScheduleSchema, default: () => ({ enabled: false, startTime: '08:00', endTime: '17:00' }) },
}, { _id: false });

const sporadicExceptionSchema = new mongoose.Schema({
  date: { type: String, required: true }, // Format: "YYYY-MM-DD"
  type: {
    type: String,
    enum: ['available', 'unavailable'],
    default: 'available',
  },
  startTime: { type: String, default: '08:00' },
  endTime: { type: String, default: '17:00' },
  reason: { type: String, default: '' },
}, { _id: true, timestamps: true });

const availabilitySchema = new mongoose.Schema({
  employeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  weeklySchedule: {
    type: weekDaysSchema,
    default: () => ({}),
  },
  isBiWeeklyEnabled: {
    type: Boolean,
    default: false,
  },
  evenWeekSchedule: {
    type: weekDaysSchema,
    default: () => ({}),
  },
  oddWeekSchedule: {
    type: weekDaysSchema,
    default: () => ({}),
  },
  sporadicExceptions: [sporadicExceptionSchema],
  defaultDayStart: { type: String, default: '08:00' },
  defaultDayEnd: { type: String, default: '19:00' },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Availability', availabilitySchema);
