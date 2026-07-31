const express = require('express');
const router = express.Router();
const jobScheduleController = require('../controllers/jobScheduleController');
const sendQuoteToCustomerController = require('../controllers/Job/sendQuoteTocustomerController');

router.post('/jobSchedule', jobScheduleController.jobSchedule);
router.get('/jobList', jobScheduleController.jobList);
router.delete('/job-schedule/:id', jobScheduleController.deleteJobSchedule);
router.put('/job-schedule/:id', jobScheduleController.updateJobSchedule);
router.get('/jobs/:id', jobScheduleController.getJobScheduleById);

router.get('/jobListByCustomerId', jobScheduleController.jobListByCustomerId);

router.get('/searchedJobs', jobScheduleController.searchedJobs); 
router.post('/jobNotes', jobScheduleController.jobNotes);

router.get('/notesListByJobId', jobScheduleController.notesListByJobId);

router.put('/updateJobNotes/:notesId', jobScheduleController.updateJobNotes);
//router.get('/financialProcessListByJobId', jobScheduleController.financialProcessListByJobId);
//router.put('/updateFinancialProcess/:id', jobScheduleController.updateFinancialProcess);
//router.post('/jobs/sendQuoteToCustomer', sendQuoteToCustomerController.sendQuoteToCustomer);


module.exports = router;