const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.post('/', roleMiddleware('Admin'), taskController.createTask);

router.get('/', taskController.getTasks);

router.put('/:id', taskController.updateTask);

router.delete('/:id', roleMiddleware('Admin'), taskController.deleteTask);

module.exports = router;
