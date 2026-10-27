const express = require('express');
const router = express.Router();
const jobScheduleController = require('../controllers/jobScheduleController');
const sendQuoteToCustomerController = require('../controllers/Job/sendQuoteTocustomerController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Enforce Default-Deny: all job schedule operations require authenticated session
router.use(authMiddleware);

router.post('/jobSchedule', roleMiddleware(['Admin', 'Staff', 'Agent']), jobScheduleController.jobSchedule);
router.get('/jobList', jobScheduleController.jobList);
router.delete('/job-schedule/:id', roleMiddleware('Admin'), jobScheduleController.deleteJobSchedule);
router.put('/job-schedule/:id', roleMiddleware(['Admin', 'Staff', 'Agent']), jobScheduleController.updateJobSchedule);
router.get('/jobs/:id', jobScheduleController.getJobScheduleById);

router.get('/jobListByCustomerId', jobScheduleController.jobListByCustomerId);
router.get('/searchedJobs', jobScheduleController.searchedJobs); 
router.post('/jobNotes', roleMiddleware(['Admin', 'Staff', 'Agent']), jobScheduleController.jobNotes);
router.get('/notesListByJobId', jobScheduleController.notesListByJobId);
router.put('/updateJobNotes/:notesId', roleMiddleware(['Admin', 'Staff', 'Agent']), jobScheduleController.updateJobNotes);
//router.get('/financialProcessListByJobId', jobScheduleController.financialProcessListByJobId);
//router.put('/updateFinancialProcess/:id', jobScheduleController.updateFinancialProcess);
//router.post('/jobs/sendQuoteToCustomer', sendQuoteToCustomerController.sendQuoteToCustomer);

module.exports = router;