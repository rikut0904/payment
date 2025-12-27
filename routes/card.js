var express = require('express');
var router = express.Router();

router.use('/', require('./card/index'));
router.use('/subscription', require('./card/subscription'));

module.exports = router;
