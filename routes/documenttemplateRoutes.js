const express = require('express');
const router = express.Router();
const documentTemplateController = require('../controllers/documentTemplateController'); 

router.post('/templates', documentTemplateController.createDocumentTemplate);

router.get('/templates', documentTemplateController.getDocumentTemplates);

router.get('/templates/:id', documentTemplateController.getDocumentTemplateById);

router.put('/templates/:id', documentTemplateController.updateDocumentTemplate);

router.delete('/templates/:id', documentTemplateController.deleteDocumentTemplate);

module.exports = router;
