var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  const userName = req.session.user?.name || 'No-Name';
  res.render('dashboard/index', {
    title: 'ダッシュボード',
    projectName: 'Payment',
    userName: userName,
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
