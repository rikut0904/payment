var express = require('express');
var router = express.Router();

// カード関連ルート（カード/サブスク）。
router.use('/', require('./card/index'));
router.use('/subscription', require('./card/subscription'));

module.exports = router;
