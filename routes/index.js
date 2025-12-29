var express = require('express');
var router = express.Router();

// 公開トップページを描画する。
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Payment',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig
  });
});

module.exports = router;
