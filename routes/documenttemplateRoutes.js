const express = require('express');
const router = express.Router();
const documentTemplateController = require('../controllers/documentTemplateController'); 
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Read endpoints: authenticated users (Staff and Admin) can fetch templates for generating/previewing invoices & quotes
router.get('/templates', authMiddleware, documentTemplateController.getDocumentTemplates);
router.get('/templates/:id', authMiddleware, documentTemplateController.getDocumentTemplateById);

// Mutation endpoints: only Admin / SuperAdmin can create, modify, or delete templates (preventing PDF template injection)
router.post('/templates', authMiddleware, roleMiddleware(['Admin', 'SuperAdmin', 'superadmin', 'admin']), documentTemplateController.createDocumentTemplate);
router.put('/templates/:id', authMiddleware, roleMiddleware(['Admin', 'SuperAdmin', 'superadmin', 'admin']), documentTemplateController.updateDocumentTemplate);
router.delete('/templates/:id', authMiddleware, roleMiddleware(['Admin', 'SuperAdmin', 'superadmin', 'admin']), documentTemplateController.deleteDocumentTemplate);

module.exports = router;
