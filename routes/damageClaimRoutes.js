const express = require('express');
const router = express.Router();
const damageClaimController = require('../controllers/damageClaimController');
const authMiddleware = require('../middlewares/authMiddlerware');

// All claims routes require authentication
router.use(authMiddleware);

// Export CSV
router.get('/export/csv', damageClaimController.exportClaimsCSV);

// List and Create Claims
router.get('/', damageClaimController.getDamageClaims);
router.post('/', damageClaimController.createDamageClaim);

// Single Claim Operations
router.get('/:id', damageClaimController.getDamageClaimById);
router.put('/:id', damageClaimController.updateDamageClaim);
router.put('/:id/settlement', damageClaimController.updateClaimStatusAndSettlement);
router.delete('/:id', damageClaimController.deleteDamageClaim);

module.exports = router;
