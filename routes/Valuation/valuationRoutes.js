const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/authMiddlerware');
const roleMiddleware = require('../../middlewares/roleMiddleware');
const serviceTypeController = require('../../controllers/Valuation/serviceTypeController');
const furnitureTypeController = require('../../controllers/Valuation/furnitureTypeController');
const roomTypeController = require('../../controllers/Valuation/roomTypeController');
const valuationMasterController = require('../../controllers/Valuation/valuationMasterController');

// All valuation & catalog routes require authentication
router.use(['/services', '/furniture', '/room', '/valuation'], authMiddleware);

// For service type
router.get('/services/', serviceTypeController.getAllServiceTypes);
router.post('/services', serviceTypeController.createServiceType);
router.put('/services/:id', serviceTypeController.updateServiceType);
router.delete('/services/:id', roleMiddleware('Admin'), serviceTypeController.deleteServiceType);

// For furniture type 
router.get("/furniture", furnitureTypeController.getAllFurnitureTypes);
router.get("/furniture/:id", furnitureTypeController.getFurnitureTypeById);
router.post("/furniture", furnitureTypeController.createFurnitureType);
router.put("/furniture/:id", furnitureTypeController.updateFurnitureType);
router.delete("/furniture/:id", roleMiddleware('Admin'), furnitureTypeController.deleteFurnitureType);

// For room type
router.get('/room', roomTypeController.getAllRoomTypes);
router.get('/room/:roomTypeId', roomTypeController.getRoomTypeById);
router.post('/room', roomTypeController.createRoomType);
router.put('/room/:roomTypeId', roomTypeController.updateRoomType);
router.post("/room/:roomTypeId", roomTypeController.addFurnitureInRoom);
router.post("/room/remove/:roomTypeId", roomTypeController.removeFurnitureFromRoom);
router.delete('/room/:roomTypeId', roleMiddleware('Admin'), roomTypeController.deleteRoomType);

// For valuation
router.post('/valuation', valuationMasterController.valuationMaster);
router.get('/valuation/rooms', valuationMasterController.allValuationsRooms);

module.exports = router;
