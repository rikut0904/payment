var express = require('express');
var router = express.Router();
var {
  createCard,
  listCardsByUser,
  getCardById,
  createSubscription,
  listSubscriptionsByUser,
} = require('../lib/firestoreCards');

const SUPPORTED_CARD_BRANDS = ['VISA', 'Mastercard', 'JCB', 'American Express', 'Diners Club', 'Discover', 'その他'];
const SUPPORTED_CURRENCIES = ['JPY', 'USD', 'EUR'];
const UPCOMING_MONTHS = 4;
const MAX_UPCOMING_EVENTS = 24;
const FLASH_COOKIE_NAME = 'card_notice';
const FLASH_TTL_MS = 10 * 1000;

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function parseBillingDay(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
}

function parseAmount(value) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function normalizeCurrency(value) {
  const trimmed = (value || '').trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(trimmed)) {
    return trimmed;
  }
  return 'JPY';
}

function formatCurrency(amount, currency = 'JPY') {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(safeAmount);
  } catch (err) {
    return `${safeAmount.toLocaleString('ja-JP')} ${currency}`;
  }
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDayToMonth(year, monthIndex, targetDay) {
  const safeDay = Math.max(1, Math.min(31, targetDay));
  return Math.min(safeDay, getDaysInMonth(year, monthIndex));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function computeNextBillingDate(targetDay, referenceDate = new Date()) {
  const today = startOfDay(referenceDate);
  const clampedToday = clampDayToMonth(today.getFullYear(), today.getMonth(), targetDay);
  let candidate = new Date(today.getFullYear(), today.getMonth(), clampedToday);
  if (candidate < today) {
    const nextMonthBase = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const clampedNext = clampDayToMonth(nextMonthBase.getFullYear(), nextMonthBase.getMonth(), targetDay);
    candidate = new Date(nextMonthBase.getFullYear(), nextMonthBase.getMonth(), clampedNext);
  }
  return candidate;
}

function addMonthsClamped(date, months, targetDay) {
  const base = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const clamped = clampDayToMonth(base.getFullYear(), base.getMonth(), targetDay);
  return new Date(base.getFullYear(), base.getMonth(), clamped);
}

function formatDateForDisplay(date) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day} (${weekdays[date.getDay()]})`;
}

function calculateUpcomingPayments(subscriptions, cardMap) {
  const today = startOfDay(new Date());
  const horizon = new Date(today.getFullYear(), today.getMonth() + UPCOMING_MONTHS, 0);
  const entries = [];
  subscriptions.forEach((subscription) => {
    const rawAmount = Number(subscription.amount);
    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return;
    }
    const amount = subscription.cycle === 'yearly' ? rawAmount / 12 : rawAmount;
    const card = cardMap.get(subscription.cardId);
    const billingDay = subscription.billingDay || card?.billingDay || 1;
    const targetDay = Math.max(1, Math.min(31, billingDay));
    let nextDate = computeNextBillingDate(targetDay, today);
    let iterations = 0;
    while (nextDate <= horizon && iterations < UPCOMING_MONTHS) {
      const monthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${nextDate.getFullYear()}年${nextDate.getMonth() + 1}月`;
      entries.push({
        subscriptionId: subscription.id,
        cardId: subscription.cardId,
        cardName: card?.cardName || '登録済みカード',
        subscriptionName: subscription.serviceName,
        amount,
        currency: subscription.currency || 'JPY',
        cycleLabel: subscription.cycle === 'yearly' ? '年額換算' : '月額',
        notes: subscription.notes || '',
        date: nextDate,
        formattedDate: formatDateForDisplay(nextDate),
        isoDate: nextDate.toISOString(),
        monthKey,
        monthLabel,
        formattedAmount: formatCurrency(amount, subscription.currency || 'JPY'),
      });
      iterations += 1;
      nextDate = addMonthsClamped(nextDate, 1, targetDay);
    }
  });
  entries.sort((a, b) => a.date - b.date);
  return entries.slice(0, MAX_UPCOMING_EVENTS);
}

function summarizeMonthlyTotals(upcomingPayments) {
  const summaryMap = new Map();
  upcomingPayments.forEach((payment) => {
    const existing = summaryMap.get(payment.monthKey) || {
      monthKey: payment.monthKey,
      monthLabel: payment.monthLabel,
      totalAmount: 0,
    };
    existing.totalAmount += payment.amount;
    existing.formattedTotal = formatCurrency(existing.totalAmount, 'JPY');
    existing.details = existing.details || [];
    existing.details.push({
      name: payment.subscriptionName,
      amount: payment.amount,
      formattedAmount: payment.formattedAmount,
      cycleLabel: payment.cycleLabel,
    });
    summaryMap.set(payment.monthKey, existing);
  });
  return Array.from(summaryMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function groupSubscriptionsByCard(subscriptions) {
  const grouped = new Map();
  subscriptions.forEach((subscription) => {
    const bucket = grouped.get(subscription.cardId) || [];
    bucket.push(subscription);
    grouped.set(subscription.cardId, bucket);
  });
  return grouped;
}

function encodeFlashValue(payload) {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeFlashValue(rawValue) {
  try {
    const json = Buffer.from(rawValue, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (err) {
    return null;
  }
}

function setFlashMessage(res, type, message) {
  if (!message) {
    return;
  }
  const payload = {
    type,
    message,
    createdAt: Date.now(),
  };
  res.cookie(FLASH_COOKIE_NAME, encodeFlashValue(payload), {
    maxAge: FLASH_TTL_MS,
    httpOnly: true,
    sameSite: 'lax',
  });
}

function consumeFlashMessage(req, res) {
  const raw = req.cookies?.[FLASH_COOKIE_NAME];
  if (!raw) {
    return null;
  }
  res.clearCookie(FLASH_COOKIE_NAME);
  const data = decodeFlashValue(raw);
  if (!data) {
    return null;
  }
  if (Date.now() - data.createdAt > FLASH_TTL_MS) {
    return null;
  }
  return data;
}

function renderAddCardPage(req, res, { errorMessage = '', formValues = {}, statusCode = 200 } = {}) {
  res.status(statusCode).render('card/add', {
    title: 'カードを登録',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    cardBrands: SUPPORTED_CARD_BRANDS,
    formValues,
    errorMessage,
  });
}

function renderAddSubscriptionPage(
  req,
  res,
  { cards = [], errorMessage = '', formValues = {}, statusCode = 200 } = {}
) {
  res.status(statusCode).render('card/subscription', {
    title: 'サブスクリプションを追加',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    cards,
    currencies: SUPPORTED_CURRENCIES,
    errorMessage,
    formValues,
  });
}

router.get(
  '/',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const [cards, subscriptions] = await Promise.all([listCardsByUser(sessionUid), listSubscriptionsByUser(sessionUid)]);
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const groupedSubscriptions = groupSubscriptionsByCard(subscriptions);
    const cardsWithSubscriptions = cards.map((card) => {
      const relatedSubscriptions = groupedSubscriptions.get(card.id) || [];
      const totalAmount = relatedSubscriptions.reduce((sum, sub) => {
        const amount = Number(sub.amount) || 0;
        if (sub.cycle === 'yearly') {
          return sum + amount / 12;
        }
        return sum + amount;
      }, 0);
      return Object.assign({}, card, {
        billingDayDisplay: card.billingDay ? `${card.billingDay}日` : '未設定',
        limitAmountDisplay: card.limitAmount ? formatCurrency(card.limitAmount, 'JPY') : '未設定',
        subscriptions: relatedSubscriptions.map((sub) =>
          Object.assign({}, sub, {
            billingDayDisplay: sub.billingDay ? `${sub.billingDay}日` : card.billingDay ? `カード基準（${card.billingDay}日）` : '未設定',
            formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
            cycleLabel: sub.cycle === 'yearly' ? '年額' : '月額',
            registeredEmail: sub.registeredEmail || '',
          })
        ),
        subscriptionTotal: totalAmount,
        formattedSubscriptionTotal: formatCurrency(totalAmount, 'JPY'),
      });
    });
    const unlinkedSubscriptions = subscriptions
      .filter((sub) => !cardMap.has(sub.cardId))
      .map((sub) =>
        Object.assign({}, sub, {
          formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
          billingDayDisplay: sub.billingDay ? `${sub.billingDay}日` : '未設定',
        })
      );
    const upcomingPayments = calculateUpcomingPayments(subscriptions, cardMap).map((payment) =>
      Object.assign({}, payment, {
        formattedAmount: formatCurrency(payment.amount, payment.currency),
        cycleLabel: payment.cycleLabel,
      })
    );
    const monthlyTotals = summarizeMonthlyTotals(upcomingPayments);
    const flashMessage = consumeFlashMessage(req, res);
    const noticeMessage = flashMessage?.type === 'success' ? flashMessage.message : '';
    const errorMessage = flashMessage?.type === 'error' ? flashMessage.message : '';
    res.render('card/index', {
      title: '支払情報管理',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      cards: cardsWithSubscriptions,
      unlinkedSubscriptions,
      upcomingPayments,
      monthlyTotals,
      cardBrands: SUPPORTED_CARD_BRANDS,
      currencies: SUPPORTED_CURRENCIES,
      notice: noticeMessage,
      error: errorMessage,
    });
  })
);

router.get(
  '/add',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    renderAddCardPage(req, res);
  })
);

router.post(
  '/add',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cardName = (req.body.cardName || '').trim();
    const cardBrand = SUPPORTED_CARD_BRANDS.includes(req.body.cardBrand) ? req.body.cardBrand : 'その他';
    const last4Digits = (req.body.last4Digits || '').trim();
    const billingDay = parseBillingDay(req.body.billingDay);
    const limitAmount = parseAmount(req.body.limitAmount);
    const formValues = {
      cardName,
      cardBrand,
      last4Digits,
      billingDay: req.body.billingDay,
      limitAmount: req.body.limitAmount,
    };

    if (!cardName) {
      return renderAddCardPage(req, res, {
        errorMessage: 'カード名を入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (last4Digits && !/^\d{4}$/.test(last4Digits)) {
      return renderAddCardPage(req, res, {
        errorMessage: 'カード番号下4桁は4桁の数字で入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (req.body.billingDay && billingDay === null) {
      return renderAddCardPage(req, res, {
        errorMessage: '締め日は1〜31の範囲で指定してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (req.body.limitAmount && limitAmount === null) {
      return renderAddCardPage(req, res, {
        errorMessage: '利用上限額は数値で入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    await createCard({
      userId: sessionUid,
      cardName,
      cardBrand,
      last4Digits,
      billingDay,
      limitAmount,
    });
    setFlashMessage(res, 'success', 'カードを登録しました。');
    res.redirect('/card');
  })
);

router.get(
  '/subscription',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cards = await listCardsByUser(sessionUid);
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }
    const defaultValues = {
      cardId: req.query.cardId || (cards[0]?.id || ''),
      currency: 'JPY',
    };
    renderAddSubscriptionPage(req, res, {
      cards,
      formValues: defaultValues,
    });
  })
);

router.post(
  '/subscription',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cardId = (req.body.cardId || '').trim();
    const serviceName = (req.body.serviceName || '').trim();
    const amount = parseAmount(req.body.amount);
    const billingDay = parseBillingDay(req.body.billingDay);
    const currency = normalizeCurrency(req.body.currency);
    const cycle = req.body.cycle === 'yearly' ? 'yearly' : 'monthly';
    const registeredEmail = (req.body.registeredEmail || '').trim();
    const notes = (req.body.notes || '').trim();
    const cards = await listCardsByUser(sessionUid);
    const formValues = {
      cardId,
      serviceName,
      amount: req.body.amount,
      billingDay: req.body.billingDay,
      currency,
      cycle,
      registeredEmail,
      notes,
    };

    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }

    if (!cardId) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: 'サブスクリプションを紐付けるカードを選択してください。',
        formValues,
        statusCode: 400,
      });
    }
    const card = await getCardById(cardId);
    if (!card || card.userId !== sessionUid) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: '指定されたカードが存在しません。',
        formValues,
        statusCode: 400,
      });
    }
    if (!serviceName) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: 'サブスクリプション名を入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (amount === null || amount <= 0) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: '支払額は0より大きい数値で入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (req.body.billingDay && billingDay === null) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: '課金日は1〜31の範囲で指定してください。',
        formValues,
        statusCode: 400,
      });
    }
    await createSubscription({
      userId: sessionUid,
      cardId,
      serviceName,
      amount,
      billingDay,
      currency,
      cycle,
      registeredEmail,
      notes,
    });
    setFlashMessage(res, 'success', 'サブスクリプションを追加しました。');
    res.redirect('/card');
  })
);

module.exports = router;
