const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const Task = require('../models/taskModel');
const Customer = require('../models/customer');
const JobSchedule = require('../models/jobSchedule');
const User = require('../models/user');

const BASE_URL = 'http://127.0.0.1:8080';
let adminToken = '';
let testCustomerId = null;
let testJobId = null;
let testTaskId = null;

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
  console.log('🚀 TASK 27 [UM3-124]: TASK JOB & CUSTOMER RELATION SAFETY');
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

    // 1. Create Test Fixtures: Customer & Job
    console.log('--- Setting up test Customer and Job ---');
    const cust = new Customer({
      firstName: 'Task27',
      lastName: 'Customer',
      email: 'task27.test@universalmovers.nl',
      telephone: '0612345678',
    });
    const savedCust = await cust.save();
    testCustomerId = savedCust._id;

    const job = new JobSchedule({
      customer: testCustomerId,
      status: 'Pending',
      date: new Date(),
      priceAgree: 600,
    });
    const savedJob = await job.save();
    testJobId = savedJob._id;

    assert('Test Customer created', !!testCustomerId);
    assert('Test Job created', !!testJobId);

    // 2. Create Task Linked to Job & Customer
    console.log('\n--- Creating Task linked to Job and Customer ---');
    const createRes = await axios.post(
      `${BASE_URL}/api/task`,
      {
        summary: 'Inspect Furniture Packaging',
        customer: testCustomerId,
        job: testJobId,
        status: 'open',
        priority: 'Normal',
        scheduledFor: '2026-11-25',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Task created successfully via API', [200, 201].includes(createRes.status));
    testTaskId = createRes.data._id || createRes.data.task?._id;
    assert('Task has valid ID', !!testTaskId);

    const initialTask = await Task.findById(testTaskId).lean();
    assert('Initial task has job set in DB', String(initialTask.job) === String(testJobId));
    assert('Initial task has customer set in DB', String(initialTask.customer) === String(testCustomerId));

    // -------------------------------------------------------------
    // TEST 3: Partial Update (Status only) - Job & Customer must NOT be unlinked!
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Partial Update (Status Only) ---');
    const updateRes1 = await axios.put(
      `${BASE_URL}/api/task/${testTaskId}`,
      {
        status: 'in progress',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Status update returns HTTP 200', updateRes1.status === 200);

    const taskAfterUpdate1 = await Task.findById(testTaskId).lean();
    assert('Task status updated to "in progress"', taskAfterUpdate1.status === 'in progress');
    assert('Task job relation is strictly preserved (NOT null)', String(taskAfterUpdate1.job) === String(testJobId));
    assert('Task customer relation is strictly preserved (NOT null)', String(taskAfterUpdate1.customer) === String(testCustomerId));

    // -------------------------------------------------------------
    // TEST 4: Partial Update (scheduledFor and priority only)
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Partial Update (scheduledFor & priority) ---');
    const updateRes2 = await axios.put(
      `${BASE_URL}/api/task/${testTaskId}`,
      {
        scheduledFor: '2026-11-28',
        priority: 'High',
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Schedule/priority update returns HTTP 200', updateRes2.status === 200);

    const taskAfterUpdate2 = await Task.findById(testTaskId).lean();
    assert('Task priority updated to "High"', taskAfterUpdate2.priority === 'High');
    assert('Task job relation STILL intact', String(taskAfterUpdate2.job) === String(testJobId));
    assert('Task customer relation STILL intact', String(taskAfterUpdate2.customer) === String(testCustomerId));

    // -------------------------------------------------------------
    // TEST 5: Update with Empty String ("") or undefined from form inputs
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Form with Empty String ("") for Job/Customer ---');
    const updateRes3 = await axios.put(
      `${BASE_URL}/api/task/${testTaskId}`,
      {
        summary: 'Updated Packaging Title',
        job: '', // Form input submitted empty string
        customer: 'undefined', // Form input submitted 'undefined'
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Form empty-string update returns HTTP 200', updateRes3.status === 200);

    const taskAfterUpdate3 = await Task.findById(testTaskId).lean();
    assert('Summary updated', taskAfterUpdate3.summary === 'Updated Packaging Title');
    assert('Task job relation protected from empty-string wipe', String(taskAfterUpdate3.job) === String(testJobId));
    assert('Task customer relation protected from empty-string wipe', String(taskAfterUpdate3.customer) === String(testCustomerId));

    // -------------------------------------------------------------
    // TEST 6: Job Query - Task must appear in Job task list!
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Query Tasks by Job ID ---');
    const jobQueryRes = await axios.get(
      `${BASE_URL}/api/task?jobId=${testJobId}`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Query by jobId returns HTTP 200', jobQueryRes.status === 200);
    const jobTaskList = jobQueryRes.data || [];
    const foundInJob = jobTaskList.some((t) => String(t._id) === String(testTaskId));
    assert('Task successfully found in Job task list (did not vanish from job!)', foundInJob === true);

    // -------------------------------------------------------------
    // TEST 7: Explicit Unlink Request
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Explicit Unlink Request ---');
    const unlinkRes = await axios.put(
      `${BASE_URL}/api/task/${testTaskId}`,
      {
        unlinkJob: true,
      },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert('Explicit unlink returns HTTP 200', unlinkRes.status === 200);
    const unlinkedTask = await Task.findById(testTaskId).lean();
    assert('Job relation cleanly unlinked when explicitly requested', unlinkedTask.job === null);
    assert('Customer relation remains intact when only job unlinked', String(unlinkedTask.customer) === String(testCustomerId));

  } catch (err) {
    console.error('Test execution error:', err.response?.data || err.message);
    failed++;
  } finally {
    console.log('\nCleaning up test fixtures...');
    if (testTaskId) {
      await Task.findByIdAndDelete(testTaskId);
      console.log('Cleaned up test task');
    }
    if (testJobId) {
      await JobSchedule.findByIdAndDelete(testJobId);
      console.log('Cleaned up test job');
    }
    if (testCustomerId) {
      await Customer.findByIdAndDelete(testCustomerId);
      console.log('Cleaned up test customer');
    }
    await mongoose.disconnect();

    console.log('\n======================================================');
    console.log(`TASK 27 SUMMARY: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
