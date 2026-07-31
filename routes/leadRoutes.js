const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

router.post('/leads', leadController.createLead); // Create a new lead or update an existing lead
router.get('/leadList', leadController.leadList); // Get a paginated list of leads
router.delete('/lead/:id', leadController.deleteLead); // Delete a lead by ID
router.get('/searchedLead', leadController.searchedLead); // Search leads by first name or last name
router.get("/lead/:id", leadController.getLeadById);  // Get a lead by ID

router.post("/convert-as-customer", leadController.convertAsCustomer); // Convert a lead to a customer by ID
module.exports = router;