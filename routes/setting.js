var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('setting/index', { title: '設定' });
});

module.exports = router;
