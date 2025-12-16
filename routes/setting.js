var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  const userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  res.render('setting/index', {
    title: '設定',
    projectName: 'Payment',
    userName: userName,
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
