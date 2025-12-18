var express = require('express');
var router = express.Router();
var { listLikes, addLikeEntry, getLikeById, updateLikeEntry, deleteLikeEntry } = require('../lib/firestoreLikes');

function wantsJsonResponse(req) {
  const accepts = req.headers.accept || '';
  return req.xhr || accepts.includes('application/json');
}

function isOwner(req, entry) {
  const sessionUid = req.session?.user?.uid;
  return Boolean(entry && entry.userId && sessionUid && entry.userId === sessionUid);
}

function respondForbidden(req, res, message) {
  const msg = message || 'このおすすめを操作する権限がありません。';
  if (wantsJsonResponse(req)) {
    return res.status(403).json({ success: false, error: msg });
  }
  return res.status(403).send(msg);
}

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
  const userId = req.session?.user?.uid;
  const userName = req.session?.user?.name || req.session?.user?.email;
  if (!userId) {
    return res.status(401).send('認証情報が不足しています。');
  }
  const { date, title, contentText, url, image } = req.body || {};
  if (!date || !title) {
    return res.status(400).send('必須項目が未入力です。');
  }
  const trimmedUrl = (url || '').trim();
  if (trimmedUrl && !(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
    return res.status(400).send('購入先URLはhttp://またはhttps://で始まる必要があります。');
  }
  const trimmedImage = (image || '').trim();
  if (trimmedImage && !(trimmedImage.startsWith('http://') || trimmedImage.startsWith('https://'))) {
    return res.status(400).send('商品画像URLはhttp://またはhttps://で始まる必要があります。');
  }
  await addLikeEntry({
    userId,
    userName,
    date,
    title,
    content: (contentText || '').trim(),
    url: trimmedUrl,
    image: trimmedImage,
  });
  res.redirect('/like');
});

router.get('/update/:id', async function (req, res) {
  const entry = await getLikeById(req.params.id);
  const wantsJson = wantsJsonResponse(req);
  if (!entry) {
    if (wantsJson) {
      return res.status(404).json({ success: false, error: 'おすすめが見つかりません。' });
    }
    return res.redirect('/like');
  }
  if (!isOwner(req, entry)) {
    return respondForbidden(req, res, 'このおすすめを編集する権限がありません。');
  }
  if (wantsJson) {
    return res.json({ success: true });
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
  const entry = await getLikeById(req.params.id);
  if (!entry) {
    return res.status(404).send('おすすめが見つかりません。');
  }
  if (!isOwner(req, entry)) {
    return respondForbidden(req, res, 'このおすすめを編集する権限がありません。');
  }
  const { date, title, contentText, url, image } = req.body || {};
  if (!date || !title) {
    return res.status(400).send('必須項目が未入力です。');
  }
  const trimmedUrl = (url || '').trim();
  if (trimmedUrl && !(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
    return res.status(400).send('購入先URLはhttp://またはhttps://で始まる必要があります。');
  }
  const trimmedImage = (image || '').trim();
  if (trimmedImage && !(trimmedImage.startsWith('http://') || trimmedImage.startsWith('https://'))) {
    return res.status(400).send('商品画像URLはhttp://またはhttps://で始まる必要があります。');
  }
  await updateLikeEntry(req.params.id, {
    date,
    title,
    content: (contentText || '').trim(),
    url: trimmedUrl,
    image: trimmedImage,
  });
  res.redirect('/like');
});

async function handleDelete(req, res) {
  const entry = await getLikeById(req.params.id);
  const wantsJson = wantsJsonResponse(req);
  if (!entry) {
    if (wantsJson) {
      return res.status(404).json({ success: false, error: 'おすすめが見つかりません。' });
    }
    return res.status(404).send('おすすめが見つかりません。');
  }
  if (!isOwner(req, entry)) {
    if (wantsJson) {
      return res.status(403).json({ success: false, error: 'このおすすめを削除する権限がありません。' });
    }
    return res.status(403).send('このおすすめを削除する権限がありません。');
  }
  await deleteLikeEntry(req.params.id);
  if (wantsJson) {
    return res.json({ success: true });
  }
  res.redirect('/like');
}

router.post('/delete/:id', handleDelete);

router.get('/detail/:id', async function (req, res) {
  const entry = await getLikeById(req.params.id);
  if (!entry) {
    return res.redirect('/like');
  }
  const userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  res.render('like/detail', {
    title: 'おすすめの詳細',
    projectName: 'Payment',
    userName,
    firebaseConfig: req.app.locals.firebaseConfig,
    entry,
  });
});

router.get('/:id', function (req, res) {
  res.redirect(`/like/detail/${req.params.id}`);
});

module.exports = router;
