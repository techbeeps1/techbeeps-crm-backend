const express = require('express');
const router = express.Router();
const newsItemsController = require('../../controllers/Communication/newsItemsController')

router.post('/createNewsItem', newsItemsController.createNewsItems);
router.put('/editNewsItem/:newsItemId', newsItemsController.editNewsItem);
router.delete("/deleteNewsItem/:newsItemId", newsItemsController.deleteNewsItem);
router.get('/newsItemsList', newsItemsController.newsItemsList);
module.exports = router;