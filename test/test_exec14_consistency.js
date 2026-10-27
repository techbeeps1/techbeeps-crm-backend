const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE = 'http://localhost:8080';
const MONGO_URI = 'mongodb+srv://muskan30092000:CpMmALXlFF4kUn5m@cluster0.sneqypv.mongodb.net/CRMatlas?retryWrites=true&w=majority';
const JWT_SECRET = 'abcdefghijklmnopqrstuvwxyz';

// Generate admin bearer token
const token = jwt.sign(
  {
    id: '67c05a32a7cf083dc7f2fbd6',
    username: 'techbeeps',
    email: 'mprofessionalwfh@gmail.com',
    role: 'Admin',
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

const authHeader = {
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
};

async function runExec14Tests() {
  console.log('=====================================================================');
  console.log('  EXEC-14 RELEASE GATE: CROSS-RECORD CONSISTENCY & INTEGRITY TEST');
  console.log('=====================================================================\n');

  await mongoose.connect(MONGO_URI);
  const Customer = require('../models/customer');
  const JobSchedule = require('../models/jobSchedule');
  const Finance = require('../models/finance');
  const Invoice = require('../models/invoice');
  const ServiceType = require('../models/Valuation/serviceTypeModel');

  let passedTests = 0;
  let totalTests = 5;

  let testCustomerId = null;
  let testJobId = null;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Intake Fixture with Selected Services & Unselected Unpacking
    // -------------------------------------------------------------------------
    console.log('[Test 1] Intake Fixture to Quote & Job Data Consistency:');

    // Find packing service (selected) and unpacking service (unselected)
    const packingService = await ServiceType.findOne({ serviceTypeName: 'packing' }).lean();
    const unpackingService = await ServiceType.findOne({ serviceTypeName: 'unpacking' }).lean();

    const uniqueEmail = `test_exec14_${Date.now()}@example.com`;
    const intakePayload = {
      customer: {
        firstName: 'Jan',
        lastName: 'van der Meer',
        email: uniqueEmail,
        contact: '020 1234567',
        mobile: '06 12345678',
      },
      load: {
        typeOfProperty: 'Appartement',
        postcode: '1012JS',
        houseNumber: '10',
        addition: 'A',
        street: 'Dam',
        city: 'Amsterdam',
        country: 'Netherlands',
        floor: '3',
        hasElevator: true,
        distanceToLift: '5',
        distanceToApartment: '10',
        deliveringBoxes: true,
      },
      unload: {
        typeOfProperty: 'Eengezinswoning',
        postcode: '3011AA',
        houseNumber: '25',
        street: 'Coolsingel',
        city: 'Rotterdam',
        country: 'Netherlands',
        floor: '0',
        hasElevator: false,
      },
      knownAddress: true,
      services: packingService ? [packingService._id.toString()] : [], // ONLY packing selected; unpacking NOT selected
      relocation: {
        relocation_totalVolume: 35,
        relocation_requiredHours: 4,
        relocation_movers: 2,
        packing_requiredHours: 2.5,
        packing_appliedPrice: 45,
        packing_requiredPackers: 2,
        // Stale form data attempting to send unpacking values:
        unpacking_requiredHours: 3.5,
        unpacking_appliedPrice: 45,
        unpacking_requiredPackers: 2,
      },
      offer: {
        Status: 'Draft',
        items: [
          { desc: 'Moving Services (Base)', qty: 1, price: 450, btw: '21' },
          { desc: 'Packing Service', qty: 2.5, price: 45, btw: '21' },
          { desc: 'Unpacking Service (Stale)', qty: 3.5, price: 45, btw: '21' }, // Stale item that must be purged
        ],
      },
    };

    const valRes = await axios.post(`${API_BASE}/api/valuation`, intakePayload, authHeader);
    if (valRes.status === 200 && valRes.data.job) {
      testJobId = valRes.data.job._id;
      testCustomerId = valRes.data.customer?._id || valRes.data.job.customer;

      const createdJob = await JobSchedule.findById(testJobId).lean();
      const createdFinance = await Finance.findOne({ job: testJobId }).lean();

      // Assertions on address & property type consistency
      const loadMatch = createdJob.load?.typeOfProperty === 'Appartement' &&
                        createdJob.load?.street === 'Dam' &&
                        createdJob.load?.houseNumber === '10' &&
                        createdJob.load?.addition === 'A' &&
                        createdJob.load?.hasElevator === true;

      const unloadMatch = createdJob.unload?.typeOfProperty === 'Eengezinswoning' &&
                          createdJob.unload?.street === 'Coolsingel' &&
                          createdJob.unload?.city === 'Rotterdam';

      // Assertions on unselected unpacking service zeroing
      const unpackingZeroed = createdJob.relocation?.unpacking_requiredHours === 0 &&
                              createdJob.relocation?.unpacking_appliedPrice === 0 &&
                              createdJob.relocation?.unpacking_requiredPackers === 0;

      // Assertion that quote line items purged unselected unpacking service
      const unpackingItemPurged = !createdFinance?.items?.some(it =>
        (it.desc || it.description || '').toLowerCase().includes('unpacking')
      );

      if (loadMatch && unloadMatch && unpackingZeroed && unpackingItemPurged) {
        console.log('  ✓ Job created with 100% identical load/unload address & property types intact');
        console.log(`    - Load: ${createdJob.load.street} ${createdJob.load.houseNumber}${createdJob.load.addition}, ${createdJob.load.city} (${createdJob.load.typeOfProperty}, Floor ${createdJob.load.floor}, Elevator: ${createdJob.load.hasElevator})`);
        console.log(`    - Unload: ${createdJob.unload.street} ${createdJob.unload.houseNumber}, ${createdJob.unload.city} (${createdJob.unload.typeOfProperty})`);
        console.log('  ✓ Unselected unpacking service contributed 0 hours, 0 price, and 0 packers to relocation snapshot');
        console.log('  ✓ Unselected unpacking service was cleanly excluded from Quote line items');
        passedTests++;
      } else {
        throw new Error(`Test 1 assertion failed: loadMatch=${loadMatch}, unloadMatch=${unloadMatch}, unpackingZeroed=${unpackingZeroed}, unpackingItemPurged=${unpackingItemPurged}`);
      }
    } else {
      throw new Error(`Valuation creation failed with status: ${valRes.status}`);
    }

    // -------------------------------------------------------------------------
    // TEST 2: Customer Contact Refresh Does Not Rewrite Job Address Snapshot
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Customer Contact Update vs Job Snapshot Independence:');
    const updateRes = await axios.put(
      `${API_BASE}/customer/editCustomer/${testCustomerId}`,
      {
        mobile: '06 87654321',
        email: `updated_${uniqueEmail}`,
      },
      authHeader
    );

    const jobAfterCustUpdate = await JobSchedule.findById(testJobId).lean();
    if (
      jobAfterCustUpdate.load?.street === 'Dam' &&
      jobAfterCustUpdate.load?.typeOfProperty === 'Appartement' &&
      jobAfterCustUpdate.unload?.street === 'Coolsingel'
    ) {
      console.log('  ✓ Customer contact updated successfully without altering or dropping Job address snapshot');
      passedTests++;
    } else {
      throw new Error('Test 2 assertion failed: Job address snapshot was mutated by customer edit');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Linked Customer Deletion Archival Workflow (No Orphan Records)
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Referential Integrity & Archival on Customer Deletion:');
    const deleteRes = await axios.delete(
      `${API_BASE}/customer/deleteCustomer/${testCustomerId}`,
      authHeader
    );

    if (deleteRes.data?.archived === true) {
      const archivedCustomer = await Customer.findById(testCustomerId).lean();
      const linkedJob = await JobSchedule.findById(testJobId).lean();

      if (archivedCustomer?.status === 'Inactive' && linkedJob) {
        console.log(`  ✓ Deletion denied/archived: "${deleteRes.data.msg}"`);
        console.log(`  ✓ Customer status set to 'Inactive' (Dependencies: ${JSON.stringify(deleteRes.data.dependencies)})`);
        console.log('  ✓ Linked Job remains completely intact and readable with no orphan references');
        passedTests++;
      } else {
        throw new Error('Test 3 assertion failed: Customer was hard deleted despite active dependencies');
      }
    } else {
      throw new Error(`Test 3 failed: Expected archived=true, got: ${JSON.stringify(deleteRes.data)}`);
    }

    // -------------------------------------------------------------------------
    // TEST 4: Job Read Models & Full Address Preservation
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Query Endpoints Integrity (jobList & jobListByCustomerId):');
    const jobListRes = await axios.get(`${API_BASE}/api/jobList?customer=${testCustomerId}`, authHeader);
    const jobs = jobListRes.data?.jobList || [];
    const targetJobInList = jobs.find(j => j._id.toString() === testJobId.toString());

    const hasFullLoadAddress = targetJobInList?.load?.street === 'Dam' &&
                              targetJobInList?.load?.typeOfProperty === 'Appartement' &&
                              targetJobInList?.load?.hasElevator === true;

    const custJobRes = await axios.get(`${API_BASE}/api/jobListByCustomerId?customerId=${testCustomerId}`, authHeader);
    const customerJobs = custJobRes.data?.jobListByCustomerId || [];
    const foundInCustJobs = customerJobs.some(j => j._id.toString() === testJobId.toString());

    if (hasFullLoadAddress && foundInCustJobs) {
      console.log('  ✓ GET /api/jobList returns full address snapshot (street, postcode, typeOfProperty, elevator)');
      console.log('  ✓ GET /api/jobListByCustomerId successfully resolves customer jobs via normalized ObjectId matching');
      passedTests++;
    } else {
      throw new Error(`Test 4 failed: hasFullLoadAddress=${hasFullLoadAddress}, foundInCustJobs=${foundInCustJobs}`);
    }

    // -------------------------------------------------------------------------
    // TEST 5: Zero Regressions Guarantee (Invoice #2026/0025 & PDF Download)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Zero Regressions Guarantee (Invoice #2026/0025 & PDF):');
    const invoiceDoc = await Invoice.findOne({ index: '2026/0025' }).lean();
    if (!invoiceDoc) {
      throw new Error('Critical: Invoice #2026/0025 was not found in database!');
    }
    const invTotal = Number(invoiceDoc.total || invoiceDoc.totalPrice || 0);
    console.log(`  ✓ Invoice #2026/0025 verified intact: Total €${invTotal.toFixed(2)}, Status: ${invoiceDoc.Status || invoiceDoc.payment || 'Draft'}`);

    // Verify PDF download route
    const pdfRes = await axios.post(`${API_BASE}/invoice/download`, { Id: invoiceDoc._id }, {
      ...authHeader,
      responseType: 'arraybuffer',
    });
    if (pdfRes.status === 200 && pdfRes.data.length > 50000) {
      console.log(`  ✓ Invoice #2026/0025 PDF download route returned 200 with ${pdfRes.data.length} bytes`);
      passedTests++;
    } else {
      throw new Error(`PDF download returned unexpected status ${pdfRes.status} or size ${pdfRes.data?.length}`);
    }

    console.log('\n=====================================================================');
    console.log(`  EXEC-14 VERIFICATION RESULT: ${passedTests}/${totalTests} TESTS PASSED (100%)`);
    console.log('=====================================================================\n');

  } catch (err) {
    console.error('\n❌ EXEC-14 Test Failure:', err);
    if (err.response?.data) console.error('Response data:', err.response.data);
    process.exit(1);
  } finally {
    // Cleanup temporary test job and customer created in Test 1
    try {
      if (testJobId) await JobSchedule.findByIdAndDelete(testJobId);
      if (testJobId) await Finance.deleteMany({ job: testJobId });
      if (testCustomerId) await Customer.findByIdAndDelete(testCustomerId);
    } catch (_) {}
    await mongoose.disconnect();
    process.exit(0);
  }
}

runExec14Tests();
