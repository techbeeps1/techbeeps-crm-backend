const express = require('express');
const router = express.Router();
const jobScheduleController = require('../controllers/jobScheduleController');
const sendQuoteToCustomerController = require('../controllers/Job/sendQuoteTocustomerController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/jobSchedule', authMiddleware, roleMiddleware('Admin'), jobScheduleController.jobSchedule);
router.get('/jobList', jobScheduleController.jobList);
router.delete('/job-schedule/:id', authMiddleware, roleMiddleware('Admin'), jobScheduleController.deleteJobSchedule);
router.put('/job-schedule/:id', authMiddleware, roleMiddleware('Admin'), jobScheduleController.updateJobSchedule);
router.get('/jobs/:id', jobScheduleController.getJobScheduleById);

router.get('/jobListByCustomerId', jobScheduleController.jobListByCustomerId);

router.get('/searchedJobs', jobScheduleController.searchedJobs); 
router.post('/jobNotes', authMiddleware, roleMiddleware('Admin'), jobScheduleController.jobNotes);

router.get('/notesListByJobId', jobScheduleController.notesListByJobId);

router.put('/updateJobNotes/:notesId', authMiddleware, roleMiddleware('Admin'), jobScheduleController.updateJobNotes);
//router.get('/financialProcessListByJobId', jobScheduleController.financialProcessListByJobId);
//router.put('/updateFinancialProcess/:id', jobScheduleController.updateFinancialProcess);
//router.post('/jobs/sendQuoteToCustomer', sendQuoteToCustomerController.sendQuoteToCustomer);

module.exports = router;