var express = require('express');
var router = express.Router();

/* GET card page. */
router.get('/', function(req, res) {
  const userName = req.session.user?.name || 'No-Name';
  res.render('card/index', {
    title: '支払情報管理',
    projectName: 'Payment',
    userName: userName,
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

module.exports = router;
