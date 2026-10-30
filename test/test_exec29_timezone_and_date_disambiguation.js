const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const {
  AMSTERDAM_TIMEZONE,
  isDateOnlyString,
  normalizeDateOnly,
  formatAmsterdamDate,
  formatAmsterdamTime,
  formatAmsterdamDateTime,
  toAmsterdamUtcInstant,
  getAmsterdamOffsetHours,
} = require('../utils/timezoneUtil');

const { formatDutchDate, formatDutchTime } = require('../utils/dutchLocaleUtil');
const Invoice = require('../models/invoice');
const Finance = require('../models/finance');
const Appointment = require('../models/appointmentModel');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let testQuoteId = null;
let testAppointmentId = null;

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

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 EXEC-29: EUROPE/AMSTERDAM TIMEZONE & DATE DISAMBIGUATION');
  console.log('======================================================\n');

  try {
    await mongoose.connect(process.env.MONGO_URI);
    adminToken = jwt.sign(
      { id: '654321654321654321654321', role: 'Admin', name: 'Admin Lead' },
      process.env.JWT_SECRET
    );

    // -------------------------------------------------------------------------
    // TEST 1: Winter vs Summer Europe/Amsterdam Offsets (DST Immunity)
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: Winter vs Summer Europe/Amsterdam Offsets ---');
    const winterInstant = new Date('2026-01-15T12:00:00Z');
    const summerInstant = new Date('2026-07-15T12:00:00Z');

    const winterOffset = getAmsterdamOffsetHours(winterInstant);
    const summerOffset = getAmsterdamOffsetHours(summerInstant);

    assert('Winter Europe/Amsterdam is UTC+1 (CET)', winterOffset === 1);
    assert('Summer Europe/Amsterdam is UTC+2 (CEST / Daylight Saving)', summerOffset === 2);

    // -------------------------------------------------------------------------
    // TEST 2: Wall-Clock to UTC Instant Conversion (0-minute shift)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: Wall-Clock to UTC Conversion & Round-Trip ---');
    // Winter appointment: 10:00 AM on 15 Jan 2026 in Amsterdam -> 09:00 UTC
    const winterApptUtc = toAmsterdamUtcInstant('2026-01-15', '10:00');
    assert('Winter 10:00 AM Amsterdam converts to 09:00 UTC', winterApptUtc.toISOString() === '2026-01-15T09:00:00.000Z');
    assert('Winter readback in Amsterdam format is 10:00', formatAmsterdamTime(winterApptUtc) === '10:00');

    // Summer appointment: 10:00 AM on 15 July 2026 in Amsterdam -> 08:00 UTC
    const summerApptUtc = toAmsterdamUtcInstant('2026-07-15', '10:00');
    assert('Summer 10:00 AM Amsterdam converts to 08:00 UTC', summerApptUtc.toISOString() === '2026-07-15T08:00:00.000Z');
    assert('Summer readback in Amsterdam format is 10:00', formatAmsterdamTime(summerApptUtc) === '10:00');

    // -------------------------------------------------------------------------
    // TEST 3: Date-Only Disambiguation (No Midnight Rollback Bug)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: Date-Only Calendar Value Disambiguation ---');
    assert('Detects YYYY-MM-DD as date-only', isDateOnlyString('2026-10-29') === true);
    assert('Detects DD-MM-YYYY as date-only', isDateOnlyString('29-10-2026') === true);
    assert('Rejects full ISO timestamps with time as date-only', isDateOnlyString('2026-10-29T14:30:00.000Z') === false);

    const fromDateOnlyString = formatAmsterdamDate('2026-10-29');
    assert('Pure YYYY-MM-DD string formats as 29-10-2026', fromDateOnlyString === '29-10-2026');

    // ISO midnight UTC string must NOT roll back to 28-10-2026!
    const fromMidnightIso = formatAmsterdamDate('2026-10-29T00:00:00.000Z');
    assert('ISO midnight UTC (2026-10-29T00:00:00.000Z) strictly formats as 29-10-2026 (No rollback)', fromMidnightIso === '29-10-2026');

    const normalizedDate = normalizeDateOnly('2026-10-29T00:00:00.000Z');
    assert('Normalized calendar date extracts pure YYYY-MM-DD', normalizedDate === '2026-10-29');

    // -------------------------------------------------------------------------
    // TEST 4: Statutory Dutch Formatter Parity
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: Statutory Dutch Locale Formatter Parity ---');
    assert('formatDutchDate delegates to Amsterdam standard', formatDutchDate('2026-10-29') === '29-10-2026');
    assert('formatDutchTime delegates to Amsterdam standard for ISO timestamp', formatDutchTime(summerApptUtc.toISOString()) === '10:00');
    assert('formatAmsterdamTime formats Date instant in Europe/Amsterdam', formatAmsterdamTime(summerApptUtc) === '10:00');

    // -------------------------------------------------------------------------
    // TEST 5: Real Appointment Persistence & Retrieval in Europe/Amsterdam
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 5: Appointment Persistence & Readback ---');
    const newAppt = new Appointment({
      date: new Date('2026-07-15T00:00:00.000Z'),
      startTime: summerApptUtc, // 10:00 AM Amsterdam
      endTime: toAmsterdamUtcInstant('2026-07-15', '12:00'), // 12:00 PM Amsterdam
      appointmentType: 'Survey',
      status: 'Scheduled',
      notes: 'EXEC-29 Timezone Verification Appointment',
    });
    const savedAppt = await newAppt.save();
    testAppointmentId = savedAppt._id;

    assert('Appointment saved successfully in database', !!testAppointmentId);
    
    // Retrieve via API
    const apptRes = await axios.get(`${BASE_URL}/api/appointment/${testAppointmentId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert('Appointment fetch returns HTTP 200', apptRes.status === 200);
    const fetchedAppt = apptRes.data;
    
    const readStartTime = formatAmsterdamTime(fetchedAppt.startTime);
    const readEndTime = formatAmsterdamTime(fetchedAppt.endTime);
    assert('Retrieved appointment start time is exactly 10:00 Amsterdam', readStartTime === '10:00');
    assert('Retrieved appointment end time is exactly 12:00 Amsterdam', readEndTime === '12:00');

    // -------------------------------------------------------------------------
    // TEST 6: Quotation Creation Integrity (Zero-Regression on /finance/add)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 6: Quotation Creation Integrity (No 422 Regression) ---');
    const existingCust = await mongoose.connection.db.collection('customers').findOne();
    const existingCustId = existingCust ? existingCust._id : '676126e313848a720f7a6729';

    const quoteRes = await axios.post(
      `${BASE_URL}/finance/add`,
      {
        customer: existingCustId,
        date: '2026-10-29',
        Status: 'Draft',
        items: [{ salesgroup: 'Movers', description: 'EXEC-29 Moving Service', quantity: 1, price: 500, btw: '' }],
        vat: 'exclusive',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Quotation creation returns HTTP 200', quoteRes.status === 200);
    testQuoteId = quoteRes.data._id || quoteRes.data.finance?._id || quoteRes.data.financeId;
    assert('Created quote has valid ID', !!testQuoteId);

    const fetchedQuote = await Finance.findById(testQuoteId).lean();
    assert('Quote status is Draft', fetchedQuote.Status === 'Draft');
    const quoteIssueDateFormatted = formatAmsterdamDate(fetchedQuote.date);
    assert('Quote issue date preserved as 29-10-2026 without shift', quoteIssueDateFormatted === '29-10-2026');

    // -------------------------------------------------------------------------
    // TEST 7: Baseline Invoice #2026/0025 Invariant Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 7: Baseline Invoice #2026/0025 Invariant Preservation ---');
    const baseline = await Invoice.findOne({ index: '2026/0025' }).lean();
    assert('Baseline invoice #2026/0025 exists in database', !!baseline);
    assert('Baseline invoice total strictly preserved at €746.39', Math.abs(Number(baseline.total) - 746.39) < 0.01);

    const pdfRes = await axios.post(
      `${BASE_URL}/invoice/download`,
      { Id: baseline._id },
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        responseType: 'arraybuffer',
      }
    );
    assert('Baseline invoice PDF download returns HTTP 200', pdfRes.status === 200);
    assert('Baseline invoice PDF size is healthy (> 50KB)', pdfRes.data.length > 50000);

  } catch (err) {
    console.error('Test execution error:', err.response?.data || err.message);
    failed++;
  } finally {
    console.log('\nCleaning up test artifacts...');
    if (testAppointmentId) {
      await Appointment.findByIdAndDelete(testAppointmentId);
      console.log('Cleaned up test appointment');
    }
    if (testQuoteId) {
      await Finance.findByIdAndDelete(testQuoteId);
      console.log('Cleaned up test quotation');
    }

    console.log('\n======================================================');
    console.log(`SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
    console.log('======================================================\n');

    if (failed === 0) {
      console.log('🎉 ALL EXEC-29 TIMEZONE & DATE DISAMBIGUATION TESTS PASSED PERFECTLY!\n');
    } else {
      console.error('❌ SOME CHECKS FAILED!\n');
      process.exitCode = 1;
    }
    process.exit();
  }
}

runTests();
