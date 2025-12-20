var express = require('express');
var router = express.Router();

/* GET dashboard page. */
router.get('/', function (req, res, next) {
  res.render('dashboard/index', {
    title: 'ダッシュボード',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
