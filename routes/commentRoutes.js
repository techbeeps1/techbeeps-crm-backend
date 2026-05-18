const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const authMiddleware = require('../middlewares/authMiddlerware');

router.post('/comment',authMiddleware, commentController.comments);
router.get('/commentListById/:userId', commentController.commentListById);

module.exports = router;