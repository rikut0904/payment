var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    title: 'Payment',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig
  });
});

module.exports = router;
