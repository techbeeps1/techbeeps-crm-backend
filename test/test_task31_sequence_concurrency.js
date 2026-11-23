const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const assert = require('assert');

const JobSchedule = require('../models/jobSchedule');
const Finance = require('../models/finance');
const Invoice = require('../models/invoice');
const LeaveBalance = require('../models/LeaveBalance');
const Customer = require('../models/customer');
const { getNextJobIndex, getNextQuoteIndex } = require('../utils/sequenceGenerator');

let testCustomer = null;
const createdJobIds = [];
const createdFinanceIds = [];

async function setup() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[Setup] Connected to MongoDB Atlas');

  testCustomer = await Customer.create({
    firstName: 'Sequence',
    lastName: 'Tester',
    email: `seq.test.${Date.now()}@example.com`,
    contact: '0612345678'
  });
}

async function cleanup() {
  try {
    if (createdJobIds.length > 0) {
      await JobSchedule.deleteMany({ _id: { $in: createdJobIds } });
    }
    if (createdFinanceIds.length > 0) {
      await Finance.deleteMany({ _id: { $in: createdFinanceIds } });
    }
    if (testCustomer) {
      await Customer.deleteOne({ _id: testCustomer._id });
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Disconnected from MongoDB Atlas');
  } catch (err) {
    console.error('Error in cleanup:', err.message);
  }
}

async function runTests() {
  try {
    await setup();
    console.log('\n=== RUNNING TASK 31: SEQUENCE CONCURRENCY & DYNAMIC YEAR VERIFICATION ===\n');

    // -------------------------------------------------------------------------
    // TEST 1: Dynamic Year & Date Evaluation on Model Instantiation
    // -------------------------------------------------------------------------
    console.log('1. Verifying dynamic year and date evaluation (not frozen startup defaults)...');
    const fDoc = new Finance();
    assert.strictEqual(typeof fDoc.year, 'number', 'Finance.year should be a number');
    assert.strictEqual(fDoc.year, new Date().getFullYear(), 'Finance.year must evaluate dynamically to current year');
    assert.ok(fDoc.date instanceof Date, 'Finance.date must be an instance of Date');
    assert.ok(Date.now() - fDoc.date.getTime() < 2000, 'Finance.date must be freshly evaluated (within 2s)');

    const iDoc = new Invoice();
    assert.strictEqual(iDoc.year, new Date().getFullYear(), 'Invoice.year must evaluate dynamically to current year');

    const lDoc = new LeaveBalance();
    assert.strictEqual(lDoc.year, new Date().getFullYear(), 'LeaveBalance.year must evaluate dynamically to current year');
    console.log('   PASS: Finance, Invoice, and LeaveBalance dynamically evaluate current year and timestamp.');

    // -------------------------------------------------------------------------
    // TEST 2: Single-Call getNextJobIndex Generation
    // -------------------------------------------------------------------------
    console.log('2. Verifying getNextJobIndex produces sequential format...');
    const currentYear = new Date().getFullYear();
    const idx1 = await getNextJobIndex(false, currentYear);
    const idx2 = await getNextJobIndex(false, currentYear);
    assert.ok(new RegExp(`^${currentYear}/\\d{4}$`).test(idx1), `Job index format must be YYYY/NNNN, got ${idx1}`);
    assert.ok(new RegExp(`^${currentYear}/\\d{4}$`).test(idx2), `Job index format must be YYYY/NNNN, got ${idx2}`);

    const num1 = parseInt(idx1.split('/')[1], 10);
    const num2 = parseInt(idx2.split('/')[1], 10);
    assert.strictEqual(num2, num1 + 1, `Next job index must increment monotonically: ${num1} -> ${num2}`);
    console.log(`   PASS: Sequential generation: ${idx1} -> ${idx2}`);

    // -------------------------------------------------------------------------
    // TEST 3: High-Concurrency Job Creation (10 Concurrent Saves)
    // -------------------------------------------------------------------------
    console.log('3. Stress testing Job creation with 10 simultaneous concurrent requests...');
    const jobCreationPromises = [];
    for (let i = 0; i < 10; i++) {
      jobCreationPromises.push(
        JobSchedule.create({
          customer: testCustomer._id,
          status: 'Pending',
          date: new Date(),
          priceAgree: 500 + i * 10
        })
      );
    }

    const createdJobs = await Promise.all(jobCreationPromises);
    assert.strictEqual(createdJobs.length, 10, 'All 10 concurrent jobs must save successfully');

    const jobIndices = createdJobs.map(j => {
      createdJobIds.push(j._id);
      return j.index;
    });

    console.log('   Generated job indices:', jobIndices);
    const uniqueJobIndices = new Set(jobIndices);
    assert.strictEqual(
      uniqueJobIndices.size,
      10,
      `All 10 concurrent jobs must receive unique indices! Found duplicate: ${jobIndices}`
    );
    console.log('   PASS: 10/10 concurrent jobs created with zero duplicate index collisions!');

    // -------------------------------------------------------------------------
    // TEST 4: Pre-assigned Index Preservation
    // -------------------------------------------------------------------------
    console.log('4. Verifying pre-assigned job index is preserved...');
    const customJob = await JobSchedule.create({
      customer: testCustomer._id,
      index: '2026/9999',
      status: 'Pending',
      date: new Date()
    });
    createdJobIds.push(customJob._id);
    assert.strictEqual(customJob.index, '2026/9999', 'Explicitly supplied job index must not be overwritten');
    console.log('   PASS: Explicit job index strictly preserved.');

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent Quote Creation (Regression Check)
    // -------------------------------------------------------------------------
    console.log('5. Verifying concurrent Quote creation remains collision-free...');
    const quotePromises = [];
    for (let i = 0; i < 5; i++) {
      quotePromises.push(
        Finance.create({
          customer: testCustomer._id,
          Status: 'Pending',
          total: 1000 + i * 50
        })
      );
    }

    const createdQuotes = await Promise.all(quotePromises);
    assert.strictEqual(createdQuotes.length, 5, 'All 5 quotes must save successfully');
    const quoteIndices = createdQuotes.map(q => {
      createdFinanceIds.push(q._id);
      return q.index;
    });

    console.log('   Generated quote indices:', quoteIndices);
    const uniqueQuotes = new Set(quoteIndices);
    assert.strictEqual(uniqueQuotes.size, 5, 'All 5 quotes must receive unique indices');
    console.log('   PASS: 5/5 concurrent quotes created with zero collisions.');

    console.log('\n=== ALL TASK 31 VERIFICATION CHECKS PASSED (5/5) ===\n');
  } catch (error) {
    console.error('Task 31 verification failed:', error);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

runTests();
