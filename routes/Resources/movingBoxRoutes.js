const express = require('express');
const router = express.Router();
const movingBoxController = require('../../controllers/Resources/movingBoxController');

router.post(['/box', '/moving-boxes'], movingBoxController.createMovingBox);
router.get(['/box', '/moving-boxes'], movingBoxController.getAllMovingBoxes);
router.get(['/box/:id', '/moving-boxes/:id'], movingBoxController.getMovingBoxById);
router.post(['/box/:id', '/moving-boxes/:id'], movingBoxController.updateMovingBox);
router.delete(['/box/:id', '/moving-boxes/:id'], movingBoxController.deleteMovingBox);

module.exports = router;
