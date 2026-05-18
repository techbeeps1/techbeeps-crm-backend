const express = require('express');
const router = express.Router();
const movingBoxController = require('../../controllers/Resources/movingBoxController');

router.post('/box', movingBoxController.createMovingBox);
router.get('/box', movingBoxController.getAllMovingBoxes);
router.get('/box/:id', movingBoxController.getMovingBoxById);
router.post('/box/:id', movingBoxController.updateMovingBox);
router.delete('/box/:id', movingBoxController.deleteMovingBox);

module.exports = router;
