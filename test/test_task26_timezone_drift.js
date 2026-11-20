const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const {
  AMSTERDAM_TIMEZONE,
  toAmsterdamUtcInstant,
  formatAmsterdamTime,
  formatAmsterdamDate,
} = require('../utils/timezoneUtil');

const Appointment = require('../models/appointmentModel');
const User = require('../models/user');
const Employability = require('../models/employabilityModel');

const BASE_URL = 'http://127.0.0.1:8080';
let adminToken = '';
let createdApptIds = [];

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  ✅ [PASS] ${desc}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${desc}`);
    failed++;
  }
}

async function run() {
  console.log('\n======================================================');
  console.log('🚀 TASK 26 [UM3-014]: APPOINTMENT TIMEZONE DRIFT VERIFICATION');
  console.log('======================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    const adminUser = await User.findOne({ role: 'Admin', isActive: { $ne: false } }).lean();
    const adminUserId = adminUser ? adminUser._id : '67c05a32a7cf083dc7f2fbd6';
    adminToken = jwt.sign(
      { id: adminUserId, _id: adminUserId, role: 'Admin', name: 'Admin Lead' },
      process.env.JWT_SECRET || 'abcdefghijklmnopqrstuvwxyz',
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------
    // TEST 1: Winter Appointment (CET UTC+1) Creation & Roundtrip
    // -------------------------------------------------------------
    console.log('--- TEST 1: Winter Appointment (CET UTC+1: 09:00 -> 08:00 UTC) ---');
    const winterDate = '2026-01-20';
    const winterStart = '09:00';
    const winterEnd = '17:00';

    // The frontend sends toAmsterdamUtcInstant ISO string
    const winterStartUtc = toAmsterdamUtcInstant(winterDate, winterStart).toISOString();
    const winterEndUtc = toAmsterdamUtcInstant(winterDate, winterEnd).toISOString();

    assert('Winter 09:00 Amsterdam UTC representation is 08:00:00.000Z', winterStartUtc === '2026-01-20T08:00:00.000Z');
    assert('Winter 17:00 Amsterdam UTC representation is 16:00:00.000Z', winterEndUtc === '2026-01-20T16:00:00.000Z');

    const createRes1 = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: winterDate,
        startTime: winterStartUtc,
        endTime: winterEndUtc,
        appointmentType: 'Move',
        departureLocation: 'Amsterdam HQ',
        publicationStatus: 'Draft',
        assignedEmployees: [],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert('Winter appointment created via API successfully (HTTP 201/200)', [200, 201].includes(createRes1.status));
    const appt1Id = createRes1.data.appointment?._id || createRes1.data._id;
    createdApptIds.push(appt1Id);

    // Fetch and verify readback in Amsterdam timezone
    const getRes1 = await axios.get(`${BASE_URL}/api/appointment/${appt1Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Winter appointment fetch returns HTTP 200', getRes1.status === 200);
    const fetched1 = getRes1.data;

    assert('Winter startTime reads back strictly as 09:00 (No +1 hour drift!)', formatAmsterdamTime(fetched1.startTime) === '09:00');
    assert('Winter endTime reads back strictly as 17:00', formatAmsterdamTime(fetched1.endTime) === '17:00');
    assert('Winter date reads back strictly as 20-01-2026', formatAmsterdamDate(fetched1.date) === '20-01-2026');

    // -------------------------------------------------------------
    // TEST 2: Summer Appointment (CEST UTC+2) Creation & Roundtrip
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Summer Appointment (CEST UTC+2: 09:00 -> 07:00 UTC) ---');
    const summerDate = '2026-07-20';
    const summerStart = '09:00';
    const summerEnd = '18:30';

    const summerStartUtc = toAmsterdamUtcInstant(summerDate, summerStart).toISOString();
    const summerEndUtc = toAmsterdamUtcInstant(summerDate, summerEnd).toISOString();

    assert('Summer 09:00 Amsterdam UTC representation is 07:00:00.000Z', summerStartUtc === '2026-07-20T07:00:00.000Z');
    assert('Summer 18:30 Amsterdam UTC representation is 16:30:00.000Z', summerEndUtc === '2026-07-20T16:30:00.000Z');

    const createRes2 = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: summerDate,
        startTime: summerStartUtc,
        endTime: summerEndUtc,
        appointmentType: 'Survey',
        departureLocation: 'Rotterdam Depot',
        publicationStatus: 'Draft',
        assignedEmployees: [],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert('Summer appointment created via API successfully', [200, 201].includes(createRes2.status));
    const appt2Id = createRes2.data.appointment?._id || createRes2.data._id;
    createdApptIds.push(appt2Id);

    const getRes2 = await axios.get(`${BASE_URL}/api/appointment/${appt2Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const fetched2 = getRes2.data;

    assert('Summer startTime reads back strictly as 09:00 (No +2 hour drift!)', formatAmsterdamTime(fetched2.startTime) === '09:00');
    assert('Summer endTime reads back strictly as 18:30', formatAmsterdamTime(fetched2.endTime) === '18:30');

    // -------------------------------------------------------------
    // TEST 3: Wall-clock String Canonicalization by Backend
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Plain Time String Canonicalization by Backend ---');
    // If a client sends plain "10:15" without timezone, backend normalizes it using toCanonicalUtcDate
    const createRes3 = await axios.post(
      `${BASE_URL}/api/appointment`,
      {
        date: '2026-01-25',
        startTime: '10:15',
        endTime: '14:45',
        appointmentType: 'Move',
        departureLocation: 'Amsterdam HQ',
        publicationStatus: 'Draft',
        assignedEmployees: [],
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert('Plain time string appointment created successfully', [200, 201].includes(createRes3.status));
    const appt3Id = createRes3.data.appointment?._id || createRes3.data._id;
    createdApptIds.push(appt3Id);

    const getRes3 = await axios.get(`${BASE_URL}/api/appointment/${appt3Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const fetched3 = getRes3.data;

    assert('Plain "10:15" saved and read back as exactly 10:15 Amsterdam', formatAmsterdamTime(fetched3.startTime) === '10:15');
    assert('Plain "14:45" saved and read back as exactly 14:45 Amsterdam', formatAmsterdamTime(fetched3.endTime) === '14:45');

    // -------------------------------------------------------------
    // TEST 4: Appointment Update (PUT) Timezone Integrity
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Appointment Update Timezone Integrity ---');
    const updateRes = await axios.put(
      `${BASE_URL}/api/appointment/${appt1Id}`,
      {
        startTime: toAmsterdamUtcInstant(winterDate, '13:00').toISOString(),
        endTime: toAmsterdamUtcInstant(winterDate, '18:00').toISOString(),
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Appointment updated successfully', updateRes.status === 200);

    const getRes1Updated = await axios.get(`${BASE_URL}/api/appointment/${appt1Id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const fetchedUpdated = getRes1Updated.data;
    assert('Updated startTime reads back as 13:00 Amsterdam', formatAmsterdamTime(fetchedUpdated.startTime) === '13:00');
    assert('Updated endTime reads back as 18:00 Amsterdam', formatAmsterdamTime(fetchedUpdated.endTime) === '18:00');

  } catch (err) {
    console.error('Test execution error:', err.response?.data || err.message);
    failed++;
  } finally {
    console.log('\nCleaning up test artifacts...');
    for (const id of createdApptIds) {
      try {
        await Appointment.findByIdAndDelete(id);
      } catch (e) {}
    }
    console.log(`Cleaned up ${createdApptIds.length} test appointments.`);
    await mongoose.disconnect();

    console.log('\n======================================================');
    console.log(`TASK 26 SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
