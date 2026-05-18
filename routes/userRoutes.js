
const express = require('express')
const { registerUser, loginUser, ProfileUser, Allusers, DeleteUser, ResetPassword, UpdateDetails, MakeAdmin } = require('../controllers/userController');
const authMiddleware = require('../middlewares/authMiddlerware');
const roleMiddleware = require('../middlewares/roleMiddleware');

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/profile', authMiddleware, ProfileUser);
router.get('/all', Allusers);
router.post('/deleteuser',authMiddleware , DeleteUser);
router.post('/reset_password', ResetPassword);
router.post('/update',authMiddleware ,UpdateDetails);
router.post('/assign_admin',authMiddleware,MakeAdmin);


module.exports = router;
