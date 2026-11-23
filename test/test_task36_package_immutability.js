const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Package = require('../models/PackageModel');
const JobSchedule = require('../models/jobSchedule');
const Customer = require('../models/customer');
const User = require('../models/user');

const DB_URI = process.env.MONGO_URI;

function makeRequest(method, pathUrl, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 8080,
      path: pathUrl,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTask36Verification() {
  console.log('[Setup] Connecting to MongoDB...');
  await mongoose.connect(DB_URI);
  console.log('[Setup] Connected to DB.');

  const createdPackageIds = [];
  const createdJobIds = [];
  const createdCustomerIds = [];

  try {
    const adminUser = await User.findOne({ role: 'Admin' });
    if (!adminUser) {
      throw new Error('No Admin user found for tests');
    }
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { id: adminUser._id, email: adminUser.email, role: adminUser.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${token}` };

    console.log('\n--- TEST SUITE: Task 36 - Master Shared Package Overwrite Protection ---');

    // 1. Create a Master Shared Package
    const masterPkg = new Package({
      name: `Master Test Package T36 - ${Date.now()}`,
      type_job: 'Fixed Full Service',
      priceAgree: 'fixed_price',
      vat: '21',
      isJobSpecific: false,
      start_job: {
        rules: [
          { description: 'Master Original Rule', unitPrice: 150, salesGroup: 'Moving', enabled: true },
        ],
      },
    });
    await masterPkg.save();
    createdPackageIds.push(masterPkg._id);
    console.log(`[Setup] Created Master Shared Package: "${masterPkg.name}" (_id: ${masterPkg._id})`);

    // 2. Create a Test Customer & Job linked to the Master Package
    const testCustomer = new Customer({
      name: 'Task 36 Test Customer',
      email: `t36_test_${Date.now()}@test.com`,
      phone: '0612345678',
    });
    await testCustomer.save();
    createdCustomerIds.push(testCustomer._id);

    const testJob = new JobSchedule({
      index: `JOB-T36-${Date.now()}`,
      customer: testCustomer._id,
      package: masterPkg._id,
      status: 'PENDING',
    });
    await testJob.save();
    createdJobIds.push(testJob._id);
    console.log(`[Setup] Created Job linked to Master Package (_id: ${testJob._id}, index: ${testJob.index})`);

    // 3. Test 1: Edit finance rules from Job context (passing jobId)
    console.log('\n[Test 1] Editing finance rules from within Job #1...');
    const editPayload = {
      jobId: testJob._id.toString(),
      start_job: {
        rules: [
          { description: 'Custom Job Specific Discounted Rule', unitPrice: 75, salesGroup: 'Moving', enabled: true },
        ],
      },
      vat: '9',
    };

    const updateRes = await makeRequest(
      'POST',
      `/api/packages/${masterPkg._id.toString()}`,
      editPayload,
      authHeaders
    );

    console.log(`Response Status: ${updateRes.status}`);
    if (updateRes.status !== 200) {
      throw new Error(`Failed to update package rules: ${JSON.stringify(updateRes.body)}`);
    }

    // A. Verify Master Package in DB remains COMPLETELY UNTOUCHED
    const refetchedMaster = await Package.findById(masterPkg._id);
    const masterRuleDesc = refetchedMaster.start_job?.rules?.[0]?.description;
    const masterRulePrice = refetchedMaster.start_job?.rules?.[0]?.unitPrice;
    console.log(`Refetched Master Package -> rule: "${masterRuleDesc}", unitPrice: ${masterRulePrice}, vat: "${refetchedMaster.vat}"`);

    if (masterRuleDesc !== 'Master Original Rule' || masterRulePrice !== 150 || refetchedMaster.vat !== '21') {
      throw new Error('CRITICAL FAILURE: Master Shared Package was OVERWRITTEN by Job edit!');
    }
    console.log('[Passed] Master Shared Package is 100% UNTOUCHED and PRESERVED.');

    // B. Verify Job is now re-linked to an isolated cloned package
    const refetchedJob = await JobSchedule.findById(testJob._id).populate('package');
    console.log(`Job's Current Package -> ID: ${refetchedJob.package?._id}, Name: "${refetchedJob.package?.name}", isJobSpecific: ${refetchedJob.package?.isJobSpecific}`);

    if (refetchedJob.package._id.toString() === masterPkg._id.toString()) {
      throw new Error('Failure: Job is still pointing to the Master Package instead of a cloned copy!');
    }
    if (!refetchedJob.package.isJobSpecific) {
      throw new Error('Failure: Cloned package is not marked with isJobSpecific: true');
    }
    createdPackageIds.push(refetchedJob.package._id);

    const jobCustomRuleDesc = refetchedJob.package.start_job?.rules?.[0]?.description;
    const jobCustomRulePrice = refetchedJob.package.start_job?.rules?.[0]?.unitPrice;
    console.log(`Job's Custom Package Rule -> "${jobCustomRuleDesc}", price: ${jobCustomRulePrice}, vat: "${refetchedJob.package?.vat}"`);

    if (jobCustomRuleDesc !== 'Custom Job Specific Discounted Rule' || jobCustomRulePrice !== 75 || refetchedJob.package.vat !== '9') {
      throw new Error('Failure: Custom job rules were not correctly saved into the isolated package clone!');
    }
    console.log('[Passed] Job successfully received its own isolated custom package clone.');

    // 4. Test 2: Secondary edit on the job's custom package (in-place update, no redundant clones)
    console.log('\n[Test 2] Editing rules a second time on the same Job...');
    const secondPayload = {
      jobId: testJob._id.toString(),
      start_job: {
        rules: [
          { description: 'Secondary Updated Rule', unitPrice: 90, salesGroup: 'Moving', enabled: true },
        ],
      },
    };

    const secondRes = await makeRequest(
      'POST',
      `/api/packages/${refetchedJob.package._id.toString()}`,
      secondPayload,
      authHeaders
    );

    if (secondRes.status !== 200) {
      throw new Error(`Second update failed: ${JSON.stringify(secondRes.body)}`);
    }

    const jobAfterSecond = await JobSchedule.findById(testJob._id).populate('package');
    if (jobAfterSecond.package._id.toString() !== refetchedJob.package._id.toString()) {
      throw new Error('Failure: Second edit created an unnecessary new clone instead of updating in-place!');
    }
    if (jobAfterSecond.package.start_job?.rules?.[0]?.description !== 'Secondary Updated Rule') {
      throw new Error('Failure: Second update rules did not persist!');
    }
    console.log('[Passed] Subsequent edits update the job-specific package in place.');

    // 5. Test 3: Verify catalog isolation (GET /api/packages)
    console.log('\n[Test 3] Verifying Master Package Catalog Isolation...');
    const catalogRes = await makeRequest('GET', '/api/packages', null, authHeaders);
    if (catalogRes.status !== 200 || !Array.isArray(catalogRes.body)) {
      throw new Error(`Failed to fetch package catalog: ${JSON.stringify(catalogRes.body)}`);
    }

    const masterInCatalog = catalogRes.body.some((p) => p._id.toString() === masterPkg._id.toString());
    const cloneInCatalog = catalogRes.body.some((p) => p._id.toString() === refetchedJob.package._id.toString());

    console.log(`Master Package present in catalog: ${masterInCatalog}`);
    console.log(`Job-specific clone leaked into catalog: ${cloneInCatalog}`);

    if (!masterInCatalog) {
      throw new Error('Failure: Master package disappeared from catalog!');
    }
    if (cloneInCatalog) {
      throw new Error('Failure: Job-specific clone leaked into master package catalog!');
    }
    console.log('[Passed] Master package catalog remains clean and isolated.');

    console.log('\n=== ALL 3/3 TASK 36 TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    console.log('[Cleanup] Cleaning up test entities...');
    if (createdJobIds.length > 0) {
      await JobSchedule.deleteMany({ _id: { $in: createdJobIds } });
    }
    if (createdPackageIds.length > 0) {
      await Package.deleteMany({ _id: { $in: createdPackageIds } });
    }
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } });
    }
    await mongoose.disconnect();
    console.log('[Cleanup] Done.');
  }
}

runTask36Verification();
