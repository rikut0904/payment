var express = require('express');
var createError = require('http-errors');
var router = express.Router();
var { listLikes, addLikeEntry, getLikeById, updateLikeEntry, deleteLikeEntry } = require('../lib/firestoreLikes');

const LIKE_CATEGORIES = [
  '衣類',
  '日用品',
  '家具',
  '家電',
  'PC周辺機器',
  'ホビー',
  '本',
  '食品',
  'ギフト',
  'その他',
];
const LIKE_SORT_OPTIONS = [
  { value: 'userName', label: 'ユーザー名' },
  { value: 'title', label: '商品名' },
  { value: 'date', label: '購入日' },
  { value: 'createdAt', label: 'おすすめ登録日' },
];
const LIKE_SORT_VALUE_SET = new Set(LIKE_SORT_OPTIONS.map((opt) => opt.value));
const SORT_ORDER_OPTIONS = [
  { value: 'asc', label: '昇順' },
  { value: 'desc', label: '降順' },
];
const SORT_ORDER_VALUE_SET = new Set(SORT_ORDER_OPTIONS.map((opt) => opt.value));
const DEFAULT_SORT_FIELD = 'createdAt';
const DEFAULT_SORT_ORDER = 'desc';

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
  const { date, title, contentText, url, image, category } = body || {};
  if (!date || !title) {
    return { error: '必須項目が未入力です。' };
  }
  if (!category || !LIKE_CATEGORIES.includes(category)) {
    return { error: 'カテゴリを選択してください。' };
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
      category,
    },
  };
}

function normalizeSortField(sortField) {
  return LIKE_SORT_VALUE_SET.has(sortField) ? sortField : DEFAULT_SORT_FIELD;
}

function normalizeSortOrder(order) {
  return SORT_ORDER_VALUE_SET.has(order) ? order : DEFAULT_SORT_ORDER;
}

/* GET like page. */
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const selectedCategory = LIKE_CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const filters = {
      userName: (req.query.userName || '').trim(),
      title: (req.query.title || '').trim(),
      category: selectedCategory,
    };
    const sortField = normalizeSortField(req.query.sort);
    const sortOrder = normalizeSortOrder(req.query.order);
    const content = await listLikes({
      category: filters.category || undefined,
      userName: filters.userName || undefined,
      sortField,
      sortOrder,
    });
    let filteredContent = content;
    if (filters.title) {
      const titleLower = filters.title.toLowerCase();
      filteredContent = filteredContent.filter((item) => (item.title || '').toLowerCase().includes(titleLower));
    }
    const showFilterOpen =
      Boolean(filters.userName || filters.title || filters.category) ||
      sortField !== DEFAULT_SORT_FIELD ||
      sortOrder !== DEFAULT_SORT_ORDER;
    res.render('like/index', {
      title: 'おすすめ商品の紹介',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      content: filteredContent,
      likeCategories: LIKE_CATEGORIES,
      filters,
      sortOptions: LIKE_SORT_OPTIONS,
      sortOrderOptions: SORT_ORDER_OPTIONS,
      sortField,
      sortOrder,
      showFilterOpen,
    });
  })
);

router.get('/add', function (req, res) {
  res.render('like/add', {
    title: 'おすすめを追加',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    likeCategories: LIKE_CATEGORIES,
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
      likeCategories: LIKE_CATEGORIES,
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
