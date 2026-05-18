const express = require('express');
const router = express.Router();
const inputsController = require('../controllers/dynamicInputController');

router.post('/', inputsController.createInput);

router.get('/', inputsController.getAllInputs);

router.get('/:id', inputsController.getInputById);

router.put('/:id', inputsController.updateInputById);

router.delete('/:id', inputsController.deleteInputById);

module.exports = router;
