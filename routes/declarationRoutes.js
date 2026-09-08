const express = require('express');
const router = express.Router();
const declarationController = require('../controllers/declarationController');
const authMiddleware = require('../middlewares/authMiddlerware');

// All declaration routes protected with JWT authentication
router.use(authMiddleware);

// 1. Get all declarations (scoped to employee for staff/agents, all for managers)
router.get('/', declarationController.getDeclarations);

// 2. Submit new declaration
router.post('/', declarationController.createDeclaration);

// 3. Get declarations for a specific employee (used in Staff Details slider)
router.get('/employee/:employeeId', declarationController.getEmployeeDeclarations);

// 4. Update declaration status (Approve, Reject, Paid)
router.put('/:id/status', declarationController.updateDeclarationStatus);

// 5. Update declaration details
router.put('/:id', declarationController.updateDeclaration);

// 6. Delete declaration
router.delete('/:id', declarationController.deleteDeclaration);

module.exports = router;
