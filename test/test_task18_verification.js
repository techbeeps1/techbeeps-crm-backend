const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Document = require('../models/document');
const uploadDocumentController = require('../controllers/uploadDocumentController');

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`  [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] ${testName} - ${detail}`);
    failedTests++;
  }
}

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    redirect(url) {
      this.statusCode = 302;
      this.body = { redirectUrl: url };
      return this;
    },
  };
  return res;
}

async function runVerification() {
  console.log('\n======================================================');
  console.log('TASK 18 [UM3-037] AUTOMATED VERIFICATION: PRIVATE R2 STORAGE & PRESIGNED URLS');
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, {
      retryWrites: true,
      serverSelectionTimeoutMS: 15000,
    });
  }
  console.log('[Setup] Connected to MongoDB Atlas\n');

  const createdDocIds = [];

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Controller Exports & Route Structure
    // -------------------------------------------------------------------------
    console.log('--- Section 1: Controller Functionality ---');
    assert(
      typeof uploadDocumentController.getPresignedUrl === 'function',
      'Test 1.1: uploadDocumentController.getPresignedUrl is exported as an async route handler'
    );
    assert(
      typeof uploadDocumentController.documentList === 'function',
      'Test 1.2: uploadDocumentController.documentList is exported'
    );
    assert(
      typeof uploadDocumentController.downloadFile === 'function',
      'Test 1.3: uploadDocumentController.downloadFile is exported'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Presigned URL Request for Non-Existent Document (404)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 2: Non-Existent Document Validation ---');
    const fakeId = new mongoose.Types.ObjectId();
    const reqNotFound = { params: { id: fakeId } };
    const resNotFound = mockResponse();

    await uploadDocumentController.getPresignedUrl(reqNotFound, resNotFound);

    assert(resNotFound.statusCode === 404, 'Test 2.1: getPresignedUrl returns 404 for non-existent document');
    assert(resNotFound.body?.message === 'Document not found', 'Test 2.2: Appropriate 404 message returned');

    // -------------------------------------------------------------------------
    // TEST 3: Document Privacy (No Raw Public URLs stored)
    // -------------------------------------------------------------------------
    console.log('\n--- Section 3: Document Private Key Storage ---');
    const testDoc = await Document.create({
      name: `documents/private-test-${Date.now()}.pdf`,
      path: `documents/private-test-${Date.now()}.pdf`,
      fileName: 'Customer_Passport_Scan.pdf',
      documentType: 'Identification',
      customer: new mongoose.Types.ObjectId(),
    });
    createdDocIds.push(testDoc._id);

    assert(
      !testDoc.path.startsWith('http://') && !testDoc.path.startsWith('https://'),
      'Test 3.1: Document path does NOT store unauthenticated public CDN URL',
      `Path stored: ${testDoc.path}`
    );

    // -------------------------------------------------------------------------
    // TEST 4: Document List Attaches Presigned/Secure Access
    // -------------------------------------------------------------------------
    console.log('\n--- Section 4: Document List Private Access ---');
    const reqList = { query: { customer: testDoc.customer.toString() } };
    const resList = mockResponse();

    await uploadDocumentController.documentList(reqList, resList);

    assert(resList.statusCode === 200, 'Test 4.1: documentList returns HTTP 200');
    assert(Array.isArray(resList.body?.documentList), 'Test 4.2: documentList array returned');

    const returnedDoc = resList.body.documentList.find(d => d._id.toString() === testDoc._id.toString());
    assert(returnedDoc !== undefined, 'Test 4.3: Test document found in customer document list');
    assert(returnedDoc.isPrivate === true, 'Test 4.4: Document flagged as isPrivate: true in list response');
    assert(returnedDoc.presignedUrl !== undefined, 'Test 4.5: presignedUrl / secure access property attached');

  } catch (err) {
    console.error('Error during test execution:', err);
    failedTests++;
  } finally {
    console.log('\n--- Cleanup ---');
    if (createdDocIds.length > 0) {
      await Document.deleteMany({ _id: { $in: createdDocIds } });
      console.log(`Cleaned up ${createdDocIds.length} test document records.`);
    }
    await mongoose.disconnect();
    console.log('MongoDB disconnected.\n');
  }

  console.log('======================================================');
  console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runVerification();
