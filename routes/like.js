var express = require('express');
var router = express.Router();
var { listLikes, addLikeEntry, getLikeById, updateLikeEntry, deleteLikeEntry } = require('../lib/firestoreLikes');

/* GET like page. */
router.get('/', async function (req, res) {
  const userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  const content = await listLikes();
  res.render('like/index', {
    title: 'おすすめ',
    projectName: 'Payment',
    userName,
    firebaseConfig: req.app.locals.firebaseConfig,
    content,
  });
});

router.get('/add', function (req, res) {
  const userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  res.render('like/add', {
    title: 'おすすめを追加',
    projectName: 'Payment',
    userName,
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

router.post('/add', async function (req, res) {
  const userName = req.session?.user?.name || req.session?.user?.email;
  const { date, title, contentText, url } = req.body || {};
  if (!date || !title) {
    return res.status(400).send('必須項目が未入力です。');
  }
  await addLikeEntry({
    userName,
    date,
    title,
    content: (contentText || '').trim(),
    url: (url || '').trim(),
  });
  res.redirect('/like');
});

router.get('/update/:id', async function (req, res) {
  const entry = await getLikeById(req.params.id);
  if (!entry) {
    return res.redirect('/like');
  }
  const userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  res.render('like/update', {
    title: 'おすすめを編集',
    projectName: 'Payment',
    userName,
    firebaseConfig: req.app.locals.firebaseConfig,
    entry,
  });
});

router.post('/update/:id', async function (req, res) {
  const { date, title, contentText, url } = req.body || {};
  if (!date || !title) {
    return res.status(400).send('必須項目が未入力です。');
  }
  await updateLikeEntry(req.params.id, {
    date,
    title,
    content: (contentText || '').trim(),
    url: (url || '').trim(),
  });
  res.redirect('/like');
});

router.post('/delete/:id', async function (req, res) {
  await deleteLikeEntry(req.params.id);
  const accepts = req.headers.accept || '';
  if (req.xhr || accepts.includes('application/json')) {
    return res.json({ success: true });
  }
  res.redirect('/like');
});

module.exports = router;
