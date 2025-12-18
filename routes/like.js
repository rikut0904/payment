var express = require('express');
var createError = require('http-errors');
var router = express.Router();
var { listLikes, addLikeEntry, getLikeById, updateLikeEntry, deleteLikeEntry } = require('../lib/firestoreLikes');

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

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
  throw createError(403, msg);
}

function extractLikeData(body) {
  const { date, title, contentText, url, image } = body || {};
  if (!date || !title) {
    return { error: '必須項目が未入力です。' };
  }
  const trimmedUrl = (url || '').trim();
  if (trimmedUrl && !(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://'))) {
    return { error: '購入先URLはhttp://またはhttps://で始まる必要があります。' };
  }
  const trimmedImage = (image || '').trim();
  if (trimmedImage && !(trimmedImage.startsWith('http://') || trimmedImage.startsWith('https://'))) {
    return { error: '商品画像URLはhttp://またはhttps://で始まる必要があります。' };
  }
  return {
    data: {
      date,
      title,
      content: (contentText || '').trim(),
      url: trimmedUrl,
      image: trimmedImage,
    },
  };
}

/* GET like page. */
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const content = await listLikes();
    res.render('like/index', {
      title: 'おすすめ',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      content,
    });
  })
);

router.get('/add', function (req, res) {
  res.render('like/add', {
    title: 'おすすめを追加',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
  });
});

router.post(
  '/add',
  asyncHandler(async function (req, res) {
    const userId = req.session?.user?.uid;
    const userName = res.locals.userName;
    if (!userId) {
      return res.status(401).send('認証情報が不足しています。');
    }
    const { data, error } = extractLikeData(req.body);
    if (error) {
      return res.status(400).send(error);
    }
    await addLikeEntry({
      userId,
      userName,
      ...data,
    });
    res.redirect('/like');
  })
);

router.get(
  '/update/:id',
  asyncHandler(async function (req, res) {
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
    res.render('like/update', {
      title: 'おすすめを編集',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      entry,
    });
  })
);

router.post(
  '/update/:id',
  asyncHandler(async function (req, res) {
    const entry = await getLikeById(req.params.id);
    if (!entry) {
      return res.status(404).send('おすすめが見つかりません。');
    }
    if (!isOwner(req, entry)) {
      return respondForbidden(req, res, 'このおすすめを編集する権限がありません。');
    }
    const { data, error } = extractLikeData(req.body);
    if (error) {
      return res.status(400).send(error);
    }
    await updateLikeEntry(req.params.id, data);
    res.redirect('/like');
  })
);

router.post(
  '/delete/:id',
  asyncHandler(async function (req, res) {
    const entry = await getLikeById(req.params.id);
    const wantsJson = wantsJsonResponse(req);
    if (!entry) {
      if (wantsJson) {
        return res.status(404).json({ success: false, error: 'おすすめが見つかりません。' });
      }
      return res.status(404).send('おすすめが見つかりません。');
    }
    if (!isOwner(req, entry)) {
      return respondForbidden(req, res, 'このおすすめを削除する権限がありません。');
    }
    await deleteLikeEntry(req.params.id);
    if (wantsJson) {
      return res.json({ success: true });
    }
    res.redirect('/like');
  })
);

router.get(
  '/detail/:id',
  asyncHandler(async function (req, res) {
    const entry = await getLikeById(req.params.id);
    if (!entry) {
      return res.redirect('/like');
    }
    res.render('like/detail', {
      title: 'おすすめの詳細',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      entry,
    });
  })
);

router.get('/:id', function (req, res) {
  res.redirect(`/like/detail/${req.params.id}`);
});

module.exports = router;
