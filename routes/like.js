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
const PAGE_SIZE = 10;
const DEFAULT_VISIBLE_DAYS = 7;
const LIKE_VISIBLE_DURATION_MS = getVisibleDurationMs();

function asyncHandler(handler) {
  // 非同期ハンドラのエラーをExpressへ渡す。
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function wantsJsonResponse(req) {
  // JSON応答を期待しているか判定する。
  const accepts = req.headers.accept || '';
  return req.xhr || accepts.includes('application/json');
}

function isOwner(req, entry) {
  // 対象データの所有者か確認する。
  const sessionUid = req.session?.user?.uid;
  return Boolean(entry && entry.userId && sessionUid && entry.userId === sessionUid);
}

function respondForbidden(req, res, message) {
  // 403をJSONかHTMLで返す。
  const msg = message || 'このおすすめを操作する権限がありません。';
  if (wantsJsonResponse(req)) {
    return res.status(403).json({ success: false, error: msg });
  }
  throw createError(403, msg);
}

function extractLikeData(body) {
  // Likeフォームの入力を検証・正規化する。
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
  // ソート対象を許可リストに正規化する。
  return LIKE_SORT_VALUE_SET.has(sortField) ? sortField : DEFAULT_SORT_FIELD;
}

function normalizeSortOrder(order) {
  // ソート順を許可リストに正規化する。
  return SORT_ORDER_VALUE_SET.has(order) ? order : DEFAULT_SORT_ORDER;
}

function getVisibleDurationMs() {
  // 表示期間を環境変数の優先順で決める。
  const envMinutes = parseFloat(process.env.LIKE_VISIBLE_MINUTES || '');
  if (Number.isFinite(envMinutes) && envMinutes > 0) {
    return envMinutes * 60 * 1000;
  }
  const envHours = parseFloat(process.env.LIKE_VISIBLE_HOURS || '');
  if (Number.isFinite(envHours) && envHours > 0) {
    return envHours * 60 * 60 * 1000;
  }
  const envDays = parseFloat(process.env.LIKE_VISIBLE_DAYS || '');
  const days = Number.isFinite(envDays) && envDays > 0 ? envDays : DEFAULT_VISIBLE_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

function getTimestampDate(value) {
  // Timestamp/Date系をDateに変換する。
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value;
  }
  if (typeof value.toDate === 'function') {
    const converted = value.toDate();
    return converted instanceof Date ? converted : null;
  }
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTimestampForDisplay(value) {
  // 日時を日本語表示に整形する。
  const date = getTimestampDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleString('ja-JP');
}

function shouldUseFirestorePagination(sortField, hasTitleFilter) {
  // Firestore側ページングが使える条件か判定する。
  return sortField === DEFAULT_SORT_FIELD && !hasTitleFilter;
}

function getComparableValue(entry, field) {
  // 安定ソート用の比較値を作る。
  if (!entry) {
    return '';
  }
  if (field === 'createdAt') {
    const createdAtDate = getTimestampDate(entry.createdAt);
    return createdAtDate ? createdAtDate.getTime() : 0;
  }
  const value = entry[field];
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (value && typeof value.toDate === 'function') {
    const converted = getTimestampDate(value);
    return converted ? converted.getTime() : 0;
  }
  return String(value).toLowerCase();
}

function sortEntriesInMemory(entries, field, order) {
  // メモリ内で安定ソートする。
  const direction = order === 'asc' ? 1 : -1;
  return entries
    .slice()
    .sort((a, b) => {
      const valueA = getComparableValue(a, field);
      const valueB = getComparableValue(b, field);
      if (valueA < valueB) {
        return -1 * direction;
      }
      if (valueA > valueB) {
        return 1 * direction;
      }
      const idA = (a?.id || '').toLowerCase();
      const idB = (b?.id || '').toLowerCase();
      return idA.localeCompare(idB);
    });
}

function buildQueryString(params) {
  // 空でないパラメータからクエリを生成する。
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function resolveRedirectPath(value, fallback = '/like') {
  // アプリ内の安全なリダイレクトだけ許可する。
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  if (!trimmed.startsWith('/')) {
    return fallback;
  }
  return trimmed;
}

// みんなのおすすめ一覧を表示する。
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const selectedCategory = LIKE_CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const filters = {
      userName: (req.query.userName || '').trim(),
      title: (req.query.title || '').trim(),
      category: selectedCategory,
    };
    const requestedPage = parseInt(req.query.page || '1', 10);
    const currentPage = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;
    const sortField = normalizeSortField(req.query.sort);
    const sortOrder = normalizeSortOrder(req.query.order);
    const hasTitleFilter = Boolean(filters.title);
    const useFirestorePagination = shouldUseFirestorePagination(sortField, hasTitleFilter);
    const visibleSince = new Date(Date.now() - LIKE_VISIBLE_DURATION_MS);
    const listResult = await listLikes({
      category: filters.category || undefined,
      userName: filters.userName || undefined,
      sortField,
      sortOrder,
      visibleSince,
      page: currentPage,
      pageSize: PAGE_SIZE,
      paginate: useFirestorePagination,
    });
    let workingContent = listResult.items || [];
    if (!useFirestorePagination) {
      workingContent = sortEntriesInMemory(workingContent, sortField, sortOrder);
    }
    let filteredContent = workingContent;
    if (hasTitleFilter) {
      const titleLower = filters.title.toLowerCase();
      filteredContent = filteredContent.filter((item) => (item.title || '').toLowerCase().includes(titleLower));
    }
    const needsManualPagination = !useFirestorePagination || hasTitleFilter;
    let totalItems;
    let totalPages;
    let safePage;
    let paginatedContent;
    if (needsManualPagination) {
      totalItems = filteredContent.length;
      totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      safePage = Math.min(currentPage, totalPages);
      const startIndex = (safePage - 1) * PAGE_SIZE;
      paginatedContent = filteredContent.slice(startIndex, startIndex + PAGE_SIZE);
    } else {
      totalItems = listResult.totalItems;
      totalPages = listResult.totalPages;
      safePage = listResult.currentPage;
      paginatedContent = filteredContent;
    }
    const buildFilterQuery = (pageNumber) =>
      buildQueryString({
        userName: filters.userName,
        title: filters.title,
        category: filters.category,
        sort: sortField,
        order: sortOrder,
        page: pageNumber,
      });
    const pagination = {
      currentPage: safePage,
      totalPages,
      totalItems,
      pageSize: PAGE_SIZE,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      prevQuery: safePage > 1 ? buildFilterQuery(safePage - 1) : null,
      nextQuery: safePage < totalPages ? buildFilterQuery(safePage + 1) : null,
      pages: Array.from({ length: totalPages }, (_, idx) => {
        const pageNumber = idx + 1;
        return {
          number: pageNumber,
          query: buildFilterQuery(pageNumber),
          isCurrent: pageNumber === safePage,
        };
      }),
    };
    const showFilterOpen =
      Boolean(filters.userName || filters.title || filters.category) ||
      sortField !== DEFAULT_SORT_FIELD ||
      sortOrder !== DEFAULT_SORT_ORDER;
    const baseListPath = '/like';
    const currentQuery = buildFilterQuery(safePage);
    const currentListUrl = currentQuery ? `${baseListPath}?${currentQuery}` : baseListPath;
    res.render('like/index', {
      title: 'おすすめ商品の紹介',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      content: paginatedContent,
      likeCategories: LIKE_CATEGORIES,
      filters,
      sortOptions: LIKE_SORT_OPTIONS,
      sortOrderOptions: SORT_ORDER_OPTIONS,
      sortField,
      sortOrder,
      pagination,
      showFilterOpen,
      filterAction: baseListPath,
      listPath: baseListPath,
      showUserNameFilter: true,
      currentListUrl,
    });
  })
);

router.get(
  '/me',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/like');
    }
    const selectedCategory = LIKE_CATEGORIES.includes(req.query.category) ? req.query.category : '';
    const filters = {
      title: (req.query.title || '').trim(),
      category: selectedCategory,
    };
    const requestedPage = parseInt(req.query.page || '1', 10);
    const currentPage = Number.isNaN(requestedPage) || requestedPage < 1 ? 1 : requestedPage;
    const sortField = normalizeSortField(req.query.sort);
    const sortOrder = normalizeSortOrder(req.query.order);
    const hasTitleFilter = Boolean(filters.title);
    const useFirestorePagination = shouldUseFirestorePagination(sortField, hasTitleFilter);
    const listResult = await listLikes({
      category: filters.category || undefined,
      userId: sessionUid,
      sortField,
      sortOrder,
      page: currentPage,
      pageSize: PAGE_SIZE,
      paginate: useFirestorePagination,
    });
    let workingContent = listResult.items || [];
    if (!useFirestorePagination) {
      workingContent = sortEntriesInMemory(workingContent, sortField, sortOrder);
    }
    let filteredContent = workingContent;
    if (hasTitleFilter) {
      const titleLower = filters.title.toLowerCase();
      filteredContent = filteredContent.filter((item) => (item.title || '').toLowerCase().includes(titleLower));
    }
    const needsManualPagination = !useFirestorePagination || hasTitleFilter;
    let totalItems;
    let totalPages;
    let safePage;
    let paginatedContent;
    if (needsManualPagination) {
      totalItems = filteredContent.length;
      totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
      safePage = Math.min(currentPage, totalPages);
      const startIndex = (safePage - 1) * PAGE_SIZE;
      paginatedContent = filteredContent.slice(startIndex, startIndex + PAGE_SIZE);
    } else {
      totalItems = listResult.totalItems;
      totalPages = listResult.totalPages;
      safePage = listResult.currentPage;
      paginatedContent = filteredContent;
    }
    const buildFilterQuery = (pageNumber) =>
      buildQueryString({
        title: filters.title,
        category: filters.category,
        sort: sortField,
        order: sortOrder,
        page: pageNumber,
      });
    const pagination = {
      currentPage: safePage,
      totalPages,
      totalItems,
      pageSize: PAGE_SIZE,
      hasPrev: safePage > 1,
      hasNext: safePage < totalPages,
      prevQuery: safePage > 1 ? buildFilterQuery(safePage - 1) : null,
      nextQuery: safePage < totalPages ? buildFilterQuery(safePage + 1) : null,
      pages: Array.from({ length: totalPages }, (_, idx) => {
        const pageNumber = idx + 1;
        return {
          number: pageNumber,
          query: buildFilterQuery(pageNumber),
          isCurrent: pageNumber === safePage,
        };
      }),
    };
    const showFilterOpen =
      Boolean(filters.title || filters.category) || sortField !== DEFAULT_SORT_FIELD || sortOrder !== DEFAULT_SORT_ORDER;
    const baseListPath = '/like/me';
    const currentQuery = buildFilterQuery(safePage);
    const currentListUrl = currentQuery ? `${baseListPath}?${currentQuery}` : baseListPath;
    res.render('like/me', {
      title: '自分のおすすめ一覧',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      content: paginatedContent,
      likeCategories: LIKE_CATEGORIES,
      filters,
      sortOptions: LIKE_SORT_OPTIONS,
      sortOrderOptions: SORT_ORDER_OPTIONS,
      sortField,
      sortOrder,
      pagination,
      showFilterOpen,
      filterAction: baseListPath,
      listPath: baseListPath,
      currentListUrl,
    });
  })
);

// おすすめ追加フォームを表示する。
router.get('/add', function (req, res) {
  const redirectPath = resolveRedirectPath(req.query.redirect, '/like');
  res.render('like/add', {
    title: 'おすすめを追加',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    likeCategories: LIKE_CATEGORIES,
    redirectPath,
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
    const redirectPath = resolveRedirectPath(req.body.redirect, '/like');
    res.redirect(redirectPath);
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
    const redirectPath = resolveRedirectPath(req.query.redirect, '/like');
    const returnToDetail = req.query.returnToDetail === '1';
    res.render('like/update', {
      title: 'おすすめを編集',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      entry,
      likeCategories: LIKE_CATEGORIES,
      redirectPath,
      returnToDetail,
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
    const listRedirectPath = resolveRedirectPath(req.body.redirect, '/like');
    if (req.body.returnToDetail === '1') {
      const detailRedirect = `/like/detail/${req.params.id}?redirect=${encodeURIComponent(listRedirectPath)}`;
      return res.redirect(detailRedirect);
    }
    res.redirect(listRedirectPath);
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
    const redirectPath = resolveRedirectPath(req.query.redirect, '/like');
    const detailEntry = Object.assign({}, entry, {
      createdAt: formatTimestampForDisplay(entry.createdAt),
    });
    res.render('like/detail', {
      title: 'おすすめの詳細',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      entry: detailEntry,
      redirectPath,
    });
  })
);

// 旧URL互換: /like/:id を詳細へリダイレクトする。
router.get('/:id', function (req, res) {
  res.redirect(`/like/detail/${req.params.id}`);
});

module.exports = router;
