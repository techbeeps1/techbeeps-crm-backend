const express = require('express');
const { registerUser, loginUser, ProfileUser, Allusers, Allemployees, DeleteUser, ResetPassword, UpdateDetails, MakeAdmin } = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddlerware');
const { optionalAuthMiddleware } = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { authLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, optionalAuthMiddleware, registerUser);
router.post('/login', authLimiter, loginUser);
router.get('/profile', authMiddleware, ProfileUser);
router.get('/all', authMiddleware, Allusers);
router.get('/employees/:date', authMiddleware, Allemployees);
router.post('/deleteuser', authMiddleware, roleMiddleware('Admin'), DeleteUser);
router.post('/reset_password', authLimiter, ResetPassword);
router.post('/update', authMiddleware, UpdateDetails);
router.post('/assign_admin', authMiddleware, roleMiddleware('Admin'), MakeAdmin);

module.exports = router;
