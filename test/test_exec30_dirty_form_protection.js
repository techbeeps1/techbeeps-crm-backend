const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const Invoice = require('../models/invoice');
const Task = require('../models/taskModel');

const BASE_URL = 'http://localhost:8080';
let adminToken = '';
let testTaskId = null;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failCount++;
  }
}

async function runTests() {
  console.log('===============================================================');
  console.log('EXEC-30 TEST SUITE: DIRTY FORM PROTECTION & EDIT INTEGRITY');
  console.log('===============================================================');

  try {
    // 0. Connect to DB and generate Admin Token
    await mongoose.connect(process.env.MONGO_URI);
    console.log('[Setup] Connected to MongoDB');

    adminToken = jwt.sign(
      { userId: 'admin_test_exec30', role: 'Admin', email: 'admin@universalmovers.nl' },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1h' }
    );
    const authHeaders = { Authorization: `Bearer ${adminToken}` };

    // SECTION 1: STATIC & ARCHITECTURAL CONTRACT CHECKS
    console.log('\n--- Section 1: Frontend Dirty Form Contract Verification ---');

    const dialogPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/components/common/DirtyConfirmDialog.tsx');
    assert(fs.existsSync(dialogPath), 'DirtyConfirmDialog component file exists at src/components/common/DirtyConfirmDialog.tsx');
    const dialogContent = fs.readFileSync(dialogPath, 'utf8');
    assert(dialogContent.includes('export const DirtyConfirmDialog'), 'DirtyConfirmDialog exports named component');
    assert(dialogContent.includes('onContinueEditing') && dialogContent.includes('onDiscardChanges'), 'DirtyConfirmDialog exposes onContinueEditing and onDiscardChanges handlers');

    // Section 1B: TaskPage Verification
    const taskPagePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Taskcomponent/TaskPage.jsx');
    assert(fs.existsSync(taskPagePath), 'TaskPage.jsx file exists');
    const taskPageContent = fs.readFileSync(taskPagePath, 'utf8');
    assert(taskPageContent.includes("import DirtyConfirmDialog from '../../components/common/DirtyConfirmDialog'"), 'TaskPage imports DirtyConfirmDialog');
    assert(taskPageContent.includes('isDirty'), 'TaskPage uses react-hook-form isDirty flag');
    assert(taskPageContent.includes('handleRequestCloseModal'), 'TaskPage intercepts modal closure with handleRequestCloseModal');
    assert(taskPageContent.includes('<DirtyConfirmDialog'), 'TaskPage mounts <DirtyConfirmDialog />');
    assert(taskPageContent.includes('disabled={loading}'), 'TaskPage disables submission button during pending async operation');

    // Section 1C: AppointmentForm Verification
    const apptFormPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Jobpage/appointmentForm.tsx');
    assert(fs.existsSync(apptFormPath), 'appointmentForm.tsx file exists');
    const apptFormContent = fs.readFileSync(apptFormPath, 'utf8');
    assert(apptFormContent.includes("import DirtyConfirmDialog from '../../components/common/DirtyConfirmDialog'"), 'appointmentForm imports DirtyConfirmDialog');
    assert(apptFormContent.includes('isFormDirty'), 'appointmentForm tracks isFormDirty state snapshot');
    assert(apptFormContent.includes('showDirtyConfirm'), 'appointmentForm uses showDirtyConfirm dialog state');
    assert(apptFormContent.includes('<DirtyConfirmDialog'), 'appointmentForm mounts <DirtyConfirmDialog />');
    assert(apptFormContent.includes('disabled={loading}'), 'appointmentForm disables action buttons during pending save');

    // Section 1D: NewJob Modal & Route Verification
    const newJobPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Jobpage/NewJob.jsx');
    assert(fs.existsSync(newJobPath), 'NewJob.jsx file exists');
    const newJobContent = fs.readFileSync(newJobPath, 'utf8');
    assert(newJobContent.includes("import DirtyConfirmDialog from '../../components/common/DirtyConfirmDialog'"), 'NewJob imports DirtyConfirmDialog');
    assert(newJobContent.includes('showDirtyConfirm'), 'NewJob tracks showDirtyConfirm dialog state');
    assert(newJobContent.includes('checkIsDirty'), 'NewJob evaluates dirty state across customer, location, and services');
    assert(newJobContent.includes('<DirtyConfirmDialog'), 'NewJob mounts <DirtyConfirmDialog />');

    const routesPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/routes/index.ts');
    const routesContent = fs.readFileSync(routesPath, 'utf8');
    assert(routesContent.includes("path: '/task'"), 'Route /task alias is registered in routes/index.ts');
    assert(routesContent.includes("path: '/tasks'"), 'Route /tasks is registered in routes/index.ts');

    // Section 1E: Extended Popups (Leads, Customers, Storage, Warehouse)
    const leadPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/UserLeads/NewUserLead.jsx');
    assert(fs.existsSync(leadPath), 'NewUserLead.jsx file exists');
    const leadContent = fs.readFileSync(leadPath, 'utf8');
    assert(leadContent.includes("import DirtyConfirmDialog from '../../components/common/DirtyConfirmDialog'"), 'NewUserLead imports DirtyConfirmDialog');
    assert(leadContent.includes('showDirtyConfirm'), 'NewUserLead tracks showDirtyConfirm dialog state');
    assert(leadContent.includes('<DirtyConfirmDialog'), 'NewUserLead mounts <DirtyConfirmDialog />');

    const customerPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/customerDetails/NewCustomer.jsx');
    assert(fs.existsSync(customerPath), 'NewCustomer.jsx file exists');
    const customerContent = fs.readFileSync(customerPath, 'utf8');
    assert(customerContent.includes("import DirtyConfirmDialog from '../../components/common/DirtyConfirmDialog'"), 'NewCustomer imports DirtyConfirmDialog');
    assert(customerContent.includes('showDirtyConfirm'), 'NewCustomer tracks showDirtyConfirm dialog state');
    assert(customerContent.includes('<DirtyConfirmDialog'), 'NewCustomer mounts <DirtyConfirmDialog />');

    const storagePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Resources/Froms/StorageForm.tsx');
    assert(fs.existsSync(storagePath), 'StorageForm.tsx file exists');
    const storageContent = fs.readFileSync(storagePath, 'utf8');
    assert(storageContent.includes("import DirtyConfirmDialog from '../../../components/common/DirtyConfirmDialog'"), 'StorageForm imports DirtyConfirmDialog');
    assert(storageContent.includes('showDirtyConfirm'), 'StorageForm tracks showDirtyConfirm dialog state');
    assert(storageContent.includes('<DirtyConfirmDialog'), 'StorageForm mounts <DirtyConfirmDialog />');

    const warehousePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Resources/Froms/PilotsFrom.tsx');
    assert(fs.existsSync(warehousePath), 'PilotsFrom.tsx file exists');
    const warehouseContent = fs.readFileSync(warehousePath, 'utf8');
    assert(warehouseContent.includes('import DirtyConfirmDialog from "../../../components/common/DirtyConfirmDialog"'), 'PilotsFrom imports DirtyConfirmDialog');
    assert(warehouseContent.includes('showDirtyConfirm'), 'PilotsFrom tracks showDirtyConfirm dialog state');
    assert(warehouseContent.includes('<DirtyConfirmDialog'), 'PilotsFrom mounts <DirtyConfirmDialog />');

    // Section 1F: Additional Resources (Storage Locations, Boxes, Vehicles)
    const storageLocPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Resources/Froms/StorageLocationForm.tsx');
    assert(fs.existsSync(storageLocPath), 'StorageLocationForm.tsx file exists');
    const storageLocContent = fs.readFileSync(storageLocPath, 'utf8');
    assert(storageLocContent.includes('DirtyConfirmDialog'), 'StorageLocationForm imports DirtyConfirmDialog');
    assert(storageLocContent.includes('showDirtyConfirm'), 'StorageLocationForm tracks showDirtyConfirm');
    assert(storageLocContent.includes('<DirtyConfirmDialog'), 'StorageLocationForm mounts <DirtyConfirmDialog />');

    const boxFormPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Resources/Froms/BoxFrom.tsx');
    assert(fs.existsSync(boxFormPath), 'BoxFrom.tsx file exists');
    const boxFormContent = fs.readFileSync(boxFormPath, 'utf8');
    assert(boxFormContent.includes('DirtyConfirmDialog'), 'BoxFrom imports DirtyConfirmDialog');
    assert(boxFormContent.includes('showDirtyConfirm'), 'BoxFrom tracks showDirtyConfirm');
    assert(boxFormContent.includes('<DirtyConfirmDialog'), 'BoxFrom mounts <DirtyConfirmDialog />');

    const vehiclePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Resources/Froms/VehicleForm.tsx');
    assert(fs.existsSync(vehiclePath), 'VehicleForm.tsx file exists');
    const vehicleContent = fs.readFileSync(vehiclePath, 'utf8');
    assert(vehicleContent.includes('DirtyConfirmDialog'), 'VehicleForm imports DirtyConfirmDialog');
    assert(vehicleContent.includes('showDirtyConfirm'), 'VehicleForm tracks showDirtyConfirm');
    assert(vehicleContent.includes('<DirtyConfirmDialog'), 'VehicleForm mounts <DirtyConfirmDialog />');

    // Section 1G: Damage Claims
    const claimPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/DamageClaims/CreateClaimModal.jsx');
    assert(fs.existsSync(claimPath), 'CreateClaimModal.jsx file exists');
    const claimContent = fs.readFileSync(claimPath, 'utf8');
    assert(claimContent.includes('DirtyConfirmDialog'), 'CreateClaimModal imports DirtyConfirmDialog');
    assert(claimContent.includes('showDirtyConfirm'), 'CreateClaimModal tracks showDirtyConfirm');
    assert(claimContent.includes('<DirtyConfirmDialog'), 'CreateClaimModal mounts <DirtyConfirmDialog />');

    // Section 1H: HRM (Apply Leave, Apply Declaration, New Employee, Team)
    const leavePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/HRM/ApplyLeaveModal.jsx');
    assert(fs.existsSync(leavePath), 'ApplyLeaveModal.jsx file exists');
    const leaveContent = fs.readFileSync(leavePath, 'utf8');
    assert(leaveContent.includes('DirtyConfirmDialog'), 'ApplyLeaveModal imports DirtyConfirmDialog');
    assert(leaveContent.includes('showDirtyConfirm'), 'ApplyLeaveModal tracks showDirtyConfirm');
    assert(leaveContent.includes('<DirtyConfirmDialog'), 'ApplyLeaveModal mounts <DirtyConfirmDialog />');

    const declPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/HRM/ApplyDeclarationModal.jsx');
    assert(fs.existsSync(declPath), 'ApplyDeclarationModal.jsx file exists');
    const declContent = fs.readFileSync(declPath, 'utf8');
    assert(declContent.includes('DirtyConfirmDialog'), 'ApplyDeclarationModal imports DirtyConfirmDialog');
    assert(declContent.includes('showDirtyConfirm'), 'ApplyDeclarationModal tracks showDirtyConfirm');
    assert(declContent.includes('<DirtyConfirmDialog'), 'ApplyDeclarationModal mounts <DirtyConfirmDialog />');

    const empPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/agents/NewEmployee.jsx');
    assert(fs.existsSync(empPath), 'NewEmployee.jsx file exists');
    const empContent = fs.readFileSync(empPath, 'utf8');
    assert(empContent.includes('DirtyConfirmDialog'), 'NewEmployee imports DirtyConfirmDialog');
    assert(empContent.includes('showDirtyConfirm'), 'NewEmployee tracks showDirtyConfirm');
    assert(empContent.includes('<DirtyConfirmDialog'), 'NewEmployee mounts <DirtyConfirmDialog />');

    const teamPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/HRM/Team.jsx');
    assert(fs.existsSync(teamPath), 'Team.jsx file exists');
    const teamContent = fs.readFileSync(teamPath, 'utf8');
    assert(teamContent.includes('DirtyConfirmDialog'), 'Team imports DirtyConfirmDialog');
    assert(teamContent.includes('showDirtyConfirm'), 'Team tracks showDirtyConfirm');
    assert(teamContent.includes('<DirtyConfirmDialog'), 'Team mounts <DirtyConfirmDialog />');

    // Section 1I: Settings & Workflows
    const servicePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Services/ServicePage.tsx');
    assert(fs.existsSync(servicePath), 'ServicePage.tsx file exists');
    const serviceContent = fs.readFileSync(servicePath, 'utf8');
    assert(serviceContent.includes('DirtyConfirmDialog'), 'ServicePage imports DirtyConfirmDialog');
    assert(serviceContent.includes('showDirtyConfirm'), 'ServicePage tracks showDirtyConfirm');
    assert(serviceContent.includes('<DirtyConfirmDialog'), 'ServicePage mounts <DirtyConfirmDialog />');

    const furniturePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Services/FurnitureType.tsx');
    assert(fs.existsSync(furniturePath), 'FurnitureType.tsx file exists');
    const furnitureContent = fs.readFileSync(furniturePath, 'utf8');
    assert(furnitureContent.includes('DirtyConfirmDialog'), 'FurnitureType imports DirtyConfirmDialog');
    assert(furnitureContent.includes('showDirtyConfirm'), 'FurnitureType tracks showDirtyConfirm');
    assert(furnitureContent.includes('<DirtyConfirmDialog'), 'FurnitureType mounts <DirtyConfirmDialog />');

    const roomPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Services/RoomType.tsx');
    assert(fs.existsSync(roomPath), 'RoomType.tsx file exists');
    const roomContent = fs.readFileSync(roomPath, 'utf8');
    assert(roomContent.includes('DirtyConfirmDialog'), 'RoomType imports DirtyConfirmDialog');
    assert(roomContent.includes('showDirtyConfirm'), 'RoomType tracks showDirtyConfirm');
    assert(roomContent.includes('<DirtyConfirmDialog'), 'RoomType mounts <DirtyConfirmDialog />');

    const salesgroupPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Methods/Salegroup/Salesgroup.jsx');
    assert(fs.existsSync(salesgroupPath), 'Salesgroup.jsx file exists');
    const salesgroupContent = fs.readFileSync(salesgroupPath, 'utf8');
    assert(salesgroupContent.includes('DirtyConfirmDialog'), 'Salesgroup imports DirtyConfirmDialog');
    assert(salesgroupContent.includes('showDirtyConfirm'), 'Salesgroup tracks showDirtyConfirm');
    assert(salesgroupContent.includes('<DirtyConfirmDialog'), 'Salesgroup mounts <DirtyConfirmDialog />');

    const packagePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Methods/NewPackage.jsx');
    assert(fs.existsSync(packagePath), 'NewPackage.jsx file exists');
    const packageContent = fs.readFileSync(packagePath, 'utf8');
    assert(packageContent.includes('DirtyConfirmDialog'), 'NewPackage imports DirtyConfirmDialog');
    assert(packageContent.includes('showDirtyConfirm'), 'NewPackage tracks showDirtyConfirm');
    assert(packageContent.includes('<DirtyConfirmDialog'), 'NewPackage mounts <DirtyConfirmDialog />');

    const packJobPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Methods/Newpackjob.jsx');
    assert(fs.existsSync(packJobPath), 'Newpackjob.jsx file exists');
    const packJobContent = fs.readFileSync(packJobPath, 'utf8');
    assert(packJobContent.includes('DirtyConfirmDialog'), 'Newpackjob imports DirtyConfirmDialog');
    assert(packJobContent.includes('showDirtyConfirm'), 'Newpackjob tracks showDirtyConfirm');
    assert(packJobContent.includes('<DirtyConfirmDialog'), 'Newpackjob mounts <DirtyConfirmDialog />');

    const emailTplPath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Methods/EmailTemplates/EmailTemplateList.tsx');
    assert(fs.existsSync(emailTplPath), 'EmailTemplateList.tsx file exists');
    const emailTplContent = fs.readFileSync(emailTplPath, 'utf8');
    assert(emailTplContent.includes('DirtyConfirmDialog'), 'EmailTemplateList imports DirtyConfirmDialog');
    assert(emailTplContent.includes('showDirtyConfirm'), 'EmailTemplateList tracks showDirtyConfirm');
    assert(emailTplContent.includes('<DirtyConfirmDialog'), 'EmailTemplateList mounts <DirtyConfirmDialog />');

    const rolePath = path.join(__dirname, '../../techbeeps-crm-frontend/src/pages/Admin/RoleSetting.tsx');
    assert(fs.existsSync(rolePath), 'RoleSetting.tsx file exists');
    const roleContent = fs.readFileSync(rolePath, 'utf8');
    assert(roleContent.includes('DirtyConfirmDialog'), 'RoleSetting imports DirtyConfirmDialog');
    assert(roleContent.includes('showDirtyConfirm'), 'RoleSetting tracks showDirtyConfirm');
    assert(roleContent.includes('<DirtyConfirmDialog'), 'RoleSetting mounts <DirtyConfirmDialog />');

    // SECTION 2: TASK & APPOINTMENT API INTEGRITY & DUPLICATE PROTECTION
    console.log('\n--- Section 2: Task API Validation & Data Integrity ---');

    // 2A: Valid Task creation succeeds with 201
    const validTaskPayload = {
      summary: 'EXEC-30 Verification Task',
      description: 'Verifying that task creation works properly and preserves dirty state.',
      scheduledFor: '2026-11-05',
      status: 'open',
      priority: 'high',
    };

    const taskRes = await axios.post(`${BASE_URL}/api/task`, validTaskPayload, { headers: authHeaders });
    assert(taskRes.status === 201 && taskRes.data?.task?._id, 'Valid task created successfully with HTTP 201');
    testTaskId = taskRes.data?.task?._id;

    // 2B: Fetch task to verify persistence
    const fetchedTask = await Task.findById(testTaskId);
    assert(fetchedTask && fetchedTask.summary === 'EXEC-30 Verification Task', 'Created task persisted properly in database');

    // SECTION 3: INVARIANT VERIFICATION (Baseline Invoice #2026/0025)
    console.log('\n--- Section 3: Baseline Invariants & Non-Regression ---');
    const baselineInv = await Invoice.findOne({ index: '2026/0025' }).lean();
    assert(Boolean(baselineInv), 'Baseline invoice #2026/0025 found in database');
    if (baselineInv) {
      assert(Math.abs(Number(baselineInv.total) - 746.39) < 0.01, `Baseline invoice total is strictly €746.39 (Actual: €${baselineInv.total})`);
      try {
        const pdfRes = await axios.post(
          `${BASE_URL}/invoice/download`,
          { Id: baselineInv._id },
          {
            headers: authHeaders,
            responseType: 'arraybuffer',
          }
        );
        assert(pdfRes.status === 200, 'Baseline invoice PDF endpoint returns HTTP 200');
        assert(pdfRes.data.length > 50000, `Baseline invoice PDF payload is healthy (${pdfRes.data.length} bytes)`);
      } catch (pdfErr) {
        assert(false, `Baseline invoice PDF check failed: ${pdfErr.message}`);
      }
    }

    // CLEANUP
    console.log('\n--- Cleanup ---');
    if (testTaskId) {
      await Task.findByIdAndDelete(testTaskId);
      console.log(`[Cleanup] Deleted test task: ${testTaskId}`);
    }

  } catch (error) {
    console.error('Fatal test error:', error);
    failCount++;
  } finally {
    await mongoose.disconnect();
    console.log('\n===============================================================');
    console.log(`TOTAL PASS: ${passCount}`);
    console.log(`TOTAL FAIL: ${failCount}`);
    console.log('===============================================================');
    process.exit(failCount > 0 ? 1 : 0);
  }
}

runTests();
