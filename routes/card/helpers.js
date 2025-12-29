var { listCardsByUser } = require('../../lib/firestoreCards');
var { CARD_TYPE_LABELS, CARD_TYPE_OPTIONS, SUPPORTED_CARD_BRANDS, SUPPORTED_CURRENCIES } = require('./constants');
var { normalizeCardType } = require('./utils');

function asyncHandler(handler) {
  // 非同期ハンドラのエラーをExpressへ渡す。
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function resolveRedirect(target, fallback) {
  // アプリ内の安全なリダイレクトのみ許可する。
  if (typeof target !== 'string') {
    return fallback;
  }
  if (!target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }
  return target;
}

function renderAddCardPage(req, res, { errorMessage = '', formValues = {}, statusCode = 200 } = {}) {
  // カード追加フォームを描画する。
  res.status(statusCode).render('card/add', {
    title: 'カードを登録',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    cardBrands: SUPPORTED_CARD_BRANDS,
    cardTypes: CARD_TYPE_OPTIONS,
    formValues,
    errorMessage,
  });
}

function renderEditCardPage(req, res, { errorMessage = '', formValues = {}, statusCode = 200 } = {}) {
  // カード編集フォームを描画する。
  res.status(statusCode).render('card/edit', {
    title: 'カードを編集',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    cardBrands: SUPPORTED_CARD_BRANDS,
    cardTypes: CARD_TYPE_OPTIONS,
    formValues,
    errorMessage,
  });
}

function renderSubscriptionFormPage(
  req,
  res,
  {
    cards = [],
    errorMessage = '',
    formValues = {},
    statusCode = 200,
    isEdit = false,
    formAction = '/card/subscription',
    formTitle,
    formDescription,
    submitLabel,
    cancelUrl = '/card',
    redirectPath = '',
  } = {}
) {
  // サブスク追加/編集フォームを描画する。
  const heading = formTitle || (isEdit ? 'サブスクリプションを編集' : 'サブスクリプションを追加');
  const description =
    formDescription ||
    (isEdit ? '契約情報を更新してください。' : '選択したカードに紐づけて支払いサイクルを管理しましょう。');
  res.status(statusCode).render('card/subscription', {
    title: heading,
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    cards,
    currencies: SUPPORTED_CURRENCIES,
    errorMessage,
    formValues,
    formTitle: heading,
    formDescription: description,
    submitLabel: submitLabel || (isEdit ? '内容を更新' : 'サブスクを登録'),
    formAction,
    cancelUrl,
    redirectPath,
  });
}

async function fetchUserCardsWithMeta(userId) {
  // カード一覧に表示用ラベルを付与する。
  const cards = await listCardsByUser(userId);
  return cards.map((card) =>
    Object.assign({}, card, {
      cardType: normalizeCardType(card.cardType),
      cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
    })
  );
}

module.exports = {
  asyncHandler,
  resolveRedirect,
  renderAddCardPage,
  renderEditCardPage,
  renderSubscriptionFormPage,
  fetchUserCardsWithMeta,
};
