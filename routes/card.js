var express = require('express');
var router = express.Router();

/* GET card page. */
router.get('/', function (req, res) {
  res.render('card/index', {
    title: '支払情報管理',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
