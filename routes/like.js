var express = require('express');
var router = express.Router();

/* GET like page. */
router.get('/', function(req, res, next) {
  const userName = req.session.user?.name || 'No-Name';
  res.render('like/index', {
    title: 'おすすめ',
    projectName: 'Payment',
    userName: userName,
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
