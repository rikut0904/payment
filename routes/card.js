var express = require('express');
var router = express.Router();
var {
  createCard,
  listCardsByUser,
  getCardById,
  updateCard,
  deleteCard,
  createSubscription,
  listSubscriptionsByUser,
} = require('../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../lib/exchangeRates');

const SUPPORTED_CARD_BRANDS = ['VISA', 'Mastercard', 'JCB', 'American Express', 'その他'];
const SUPPORTED_CURRENCIES = ['JPY', 'USD'];
const CARD_TYPE_OPTIONS = [
  { value: 'credit', label: 'クレジットカード' },
  { value: 'debit', label: 'デビットカード' },
];
const CARD_TYPE_LABELS = CARD_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});
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

function formatDayDisplay(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return '未設定';
  }
  return `${numeric}日`;
}

function normalizeCurrency(value) {
  const trimmed = (value || '').trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(trimmed)) {
    return trimmed;
  }
  return 'JPY';
}

function normalizeCardType(value) {
  return value === 'debit' ? 'debit' : 'credit';
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

function parseDateInput(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfDay(value);
  }
  if (typeof value.toDate === 'function') {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime()) ? null : startOfDay(converted);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed);
}

function formatIsoDate(value) {
  if (!value) {
    return '';
  }
  const date = parseDateInput(value);
  if (!date) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addCycle(date, cycle) {
  if (!(date instanceof Date)) {
    return null;
  }
  if (cycle === 'yearly') {
    const clampedDay = clampDayToMonth(date.getFullYear() + 1, date.getMonth(), date.getDate());
    return new Date(date.getFullYear() + 1, date.getMonth(), clampedDay);
  }
  const base = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const clamped = clampDayToMonth(base.getFullYear(), base.getMonth(), date.getDate());
  return new Date(base.getFullYear(), base.getMonth(), clamped);
}

function resolvePaymentDay(card) {
  const rawDay = card?.paymentDay;
  const numeric = Number(rawDay);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 31) {
    return null;
  }
  return numeric;
}

function alignDateToPaymentDay(date, paymentDay) {
  if (!(date instanceof Date)) {
    return null;
  }
  const base = startOfDay(date);
  const dayOfMonth = Number.isFinite(paymentDay) ? paymentDay : base.getDate();
  const clamped = clampDayToMonth(base.getFullYear(), base.getMonth(), dayOfMonth);
  let candidate = new Date(base.getFullYear(), base.getMonth(), clamped);
  if (candidate < base) {
    const nextMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const nextClamped = clampDayToMonth(nextMonth.getFullYear(), nextMonth.getMonth(), dayOfMonth);
    candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), nextClamped);
  }
  return candidate;
}

function addCycleWithPaymentDay(date, cycle, paymentDay) {
  if (!(date instanceof Date)) {
    return null;
  }
  const monthsToAdd = cycle === 'yearly' ? 12 : 1;
  const target = new Date(date.getFullYear(), date.getMonth() + monthsToAdd, 1);
  const dayOfMonth = Number.isFinite(paymentDay) ? paymentDay : date.getDate();
  const clamped = clampDayToMonth(target.getFullYear(), target.getMonth(), dayOfMonth);
  return new Date(target.getFullYear(), target.getMonth(), clamped);
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
    const startDate = parseDateInput(subscription.paymentStartDate);
    if (!startDate) {
      return;
    }
    const card = cardMap.get(subscription.cardId);
    const cardType = normalizeCardType(card?.cardType);
    const paymentDay = cardType === 'credit' ? resolvePaymentDay(card) : null;
    let nextDate =
      cardType === 'credit'
        ? alignDateToPaymentDay(startDate, paymentDay)
        : startOfDay(new Date(startDate.getTime()));
    if (!nextDate) {
      return;
    }
    if (nextDate < today) {
      let guard = 0;
      while (nextDate < today && guard < 60) {
        nextDate =
          cardType === 'credit'
            ? addCycleWithPaymentDay(nextDate, subscription.cycle, paymentDay)
            : addCycle(nextDate, subscription.cycle);
        guard += 1;
        if (!nextDate) {
          return;
        }
      }
    }
    const amount = rawAmount;
    let iterations = 0;
    while (nextDate && nextDate <= horizon && iterations < MAX_UPCOMING_EVENTS) {
      const monthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = `${nextDate.getFullYear()}年${nextDate.getMonth() + 1}月`;
      entries.push({
        subscriptionId: subscription.id,
        cardId: subscription.cardId,
        cardName: card?.cardName || '登録済みカード',
        cardType,
        cardTypeLabel: CARD_TYPE_LABELS[cardType] || 'クレジットカード',
        subscriptionName: subscription.serviceName,
        amount,
        currency: subscription.currency || 'JPY',
        cycleLabel: subscription.cycle === 'yearly' ? '年額' : '月額',
        notes: subscription.notes || '',
        date: nextDate,
        formattedDate: formatDateForDisplay(nextDate),
        isoDate: nextDate.toISOString(),
        monthKey,
        monthLabel,
        formattedAmount: formatCurrency(amount, subscription.currency || 'JPY'),
      });
      iterations += 1;
      nextDate =
        cardType === 'credit'
          ? addCycleWithPaymentDay(nextDate, subscription.cycle, paymentDay)
          : addCycle(nextDate, subscription.cycle);
    }
  });
  entries.sort((a, b) => a.date - b.date);
  return entries.slice(0, MAX_UPCOMING_EVENTS);
}

function summarizeMonthlyTotals(upcomingPayments, exchangeRates) {
  const summaryMap = new Map();
  upcomingPayments.forEach((payment) => {
    const existing = summaryMap.get(payment.monthKey) || {
      monthKey: payment.monthKey,
      monthLabel: payment.monthLabel,
      totalAmount: 0,
    };
    const normalizedCurrency = (payment.currency || 'JPY').toUpperCase();
    let normalizedAmount = Number(payment.amount) || 0;
    if (normalizedCurrency !== 'JPY') {
      const converted = convertToJpy(normalizedAmount, normalizedCurrency, exchangeRates);
      if (converted !== null) {
        normalizedAmount = converted;
      }
    }
    existing.totalAmount += normalizedAmount;
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

function buildUpcomingPaymentMonths(payments, limit = UPCOMING_MONTHS) {
  const today = startOfDay(new Date());
  const months = [];
  for (let i = 0; i < limit; i += 1) {
    const base = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const monthKey = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;
    months.push({
      monthKey,
      monthLabel: `${base.getFullYear()}年${base.getMonth() + 1}月`,
      creditPayments: [],
      debitPayments: [],
    });
  }
  const monthMap = new Map(months.map((month) => [month.monthKey, month]));
  payments.forEach((payment) => {
    const target = monthMap.get(payment.monthKey);
    if (!target) {
      return;
    }
    if (payment.cardType === 'debit') {
      target.debitPayments.push(payment);
    } else {
      target.creditPayments.push(payment);
    }
  });
  return months;
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
    cardTypes: CARD_TYPE_OPTIONS,
    formValues,
    errorMessage,
  });
}

function renderEditCardPage(req, res, { errorMessage = '', formValues = {}, statusCode = 200 } = {}) {
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
    const exchangeRatesPromise = getExchangeRates().catch((err) => {
      console.error('Failed to load exchange rates', err);
      return null;
    });
    const [cards, subscriptions, exchangeRates] = await Promise.all([
      listCardsByUser(sessionUid),
      listSubscriptionsByUser(sessionUid),
      exchangeRatesPromise,
    ]);
    const normalizedCards = cards.map((card) => {
      const cardType = normalizeCardType(card.cardType);
      return Object.assign({}, card, {
        cardType,
        cardTypeLabel: CARD_TYPE_LABELS[cardType] || 'クレジットカード',
      });
    });
    const cardMap = new Map(normalizedCards.map((card) => [card.id, card]));
    const groupedSubscriptions = groupSubscriptionsByCard(subscriptions);
    const cardsWithSubscriptions = normalizedCards.map((card) => {
      const relatedSubscriptions = groupedSubscriptions.get(card.id) || [];
      let conversionWarning = false;
      const totalAmount = relatedSubscriptions.reduce((sum, sub) => {
        const amount = Number(sub.amount) || 0;
        if (!Number.isFinite(amount) || amount <= 0) {
          return sum;
        }
        const normalizedCurrency = (sub.currency || 'JPY').toUpperCase();
        if (normalizedCurrency === 'JPY') {
          return sum + amount;
        }
        if (!exchangeRates) {
          conversionWarning = true;
          return sum + amount;
        }
        const converted = convertToJpy(amount, normalizedCurrency, exchangeRates);
        if (converted === null) {
          conversionWarning = true;
          return sum + amount;
        }
        return sum + converted;
      }, 0);
      return Object.assign({}, card, {
        billingDayDisplay: formatDayDisplay(card.billingDay),
        closingDayDisplay: formatDayDisplay(card.closingDay),
        paymentDayDisplay: formatDayDisplay(card.paymentDay),
        limitAmountDisplay: card.limitAmount ? formatCurrency(card.limitAmount, 'JPY') : '未設定',
        subscriptions: relatedSubscriptions.map((sub) => {
          const startDate = parseDateInput(sub.paymentStartDate);
          return Object.assign({}, sub, {
            paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
            formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
            cycleLabel: sub.cycle === 'yearly' ? '年額' : '月額',
            registeredEmail: sub.registeredEmail || '',
          });
        }),
        subscriptionTotal: totalAmount,
        formattedSubscriptionTotal: formatCurrency(totalAmount, 'JPY'),
        conversionWarning,
      });
    });
    const unlinkedSubscriptions = subscriptions
      .filter((sub) => !cardMap.has(sub.cardId))
      .map((sub) => {
        const startDate = parseDateInput(sub.paymentStartDate);
        return Object.assign({}, sub, {
          formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
          paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
        });
      });
    const upcomingPaymentsRaw = calculateUpcomingPayments(subscriptions, cardMap).map((payment) =>
      Object.assign({}, payment, {
        formattedAmount: formatCurrency(payment.amount, payment.currency),
      })
    );
    const upcomingPayments = upcomingPaymentsRaw;
    const monthlyTotalsRaw = summarizeMonthlyTotals(upcomingPayments, exchangeRates);
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(upcomingPayments);
    const monthlyTotals = upcomingPaymentMonths.map((month) => {
      const matched = monthlyTotalsRaw.find((item) => item.monthKey === month.monthKey);
      if (matched) {
        return matched;
      }
      return {
        monthKey: month.monthKey,
        monthLabel: month.monthLabel,
        totalAmount: 0,
        formattedTotal: formatCurrency(0, 'JPY'),
      };
    });
    const flashMessage = consumeFlashMessage(req, res);
    const noticeMessage = flashMessage?.type === 'success' ? flashMessage.message : '';
    const errorMessage = flashMessage?.type === 'error' ? flashMessage.message : '';
    res.render('card/index', {
      title: '支払情報管理',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      cards: cardsWithSubscriptions,
      unlinkedSubscriptions,
      upcomingPaymentMonths,
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
    let billingDay = parseBillingDay(req.body.billingDay);
    let closingDay = parseBillingDay(req.body.closingDay);
    let paymentDay = parseBillingDay(req.body.paymentDay);
    const limitAmount = parseAmount(req.body.limitAmount);
    const cardType = normalizeCardType(req.body.cardType);
    const formValues = {
      cardName,
      cardBrand,
      last4Digits,
      billingDay: req.body.billingDay,
      closingDay: req.body.closingDay,
      paymentDay: req.body.paymentDay,
      limitAmount: req.body.limitAmount,
      cardType,
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
    if (cardType === 'credit') {
      billingDay = null;
      if (!req.body.closingDay) {
        return renderAddCardPage(req, res, {
          errorMessage: 'クレジットカードの締め日を入力してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (closingDay === null) {
        return renderAddCardPage(req, res, {
          errorMessage: '締め日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (!req.body.paymentDay) {
        return renderAddCardPage(req, res, {
          errorMessage: 'クレジットカードの支払日を入力してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (paymentDay === null) {
        return renderAddCardPage(req, res, {
          errorMessage: '支払日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      formValues.billingDay = '';
    } else {
      closingDay = null;
      paymentDay = null;
      if (req.body.billingDay && billingDay === null) {
        return renderAddCardPage(req, res, {
          errorMessage: '課金日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      formValues.closingDay = '';
      formValues.paymentDay = '';
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
      closingDay,
      paymentDay,
      limitAmount,
      cardType,
    });
    setFlashMessage(res, 'success', 'カードを登録しました。');
    res.redirect('/card');
  })
);

router.get(
  '/edit/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cardId = req.params.id;
    const card = await getCardById(cardId);
    if (!card || card.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect('/card');
    }
    renderEditCardPage(req, res, {
      formValues: Object.assign({}, card, {
        id: card.id,
        billingDay: card.billingDay || '',
        closingDay: card.closingDay || '',
        paymentDay: card.paymentDay || '',
        cardType: normalizeCardType(card.cardType),
      }),
    });
  })
);

router.post(
  '/edit/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cardId = req.params.id;
    const existingCard = await getCardById(cardId);
    if (!existingCard || existingCard.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect('/card');
    }
    const cardName = (req.body.cardName || '').trim();
    const cardBrand = SUPPORTED_CARD_BRANDS.includes(req.body.cardBrand) ? req.body.cardBrand : 'その他';
    const last4Digits = (req.body.last4Digits || '').trim();
    let billingDay = parseBillingDay(req.body.billingDay);
    let closingDay = parseBillingDay(req.body.closingDay);
    let paymentDay = parseBillingDay(req.body.paymentDay);
    const limitAmount = parseAmount(req.body.limitAmount);
    const cardType = normalizeCardType(req.body.cardType);
    const formValues = {
      id: cardId,
      cardName,
      cardBrand,
      last4Digits,
      billingDay: req.body.billingDay,
      closingDay: req.body.closingDay,
      paymentDay: req.body.paymentDay,
      limitAmount: req.body.limitAmount,
      cardType,
    };

    if (!cardName) {
      return renderEditCardPage(req, res, {
        errorMessage: 'カード名を入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (last4Digits && !/^\d{4}$/.test(last4Digits)) {
      return renderEditCardPage(req, res, {
        errorMessage: 'カード番号下4桁は4桁の数字で入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (cardType === 'credit') {
      billingDay = null;
      if (!req.body.closingDay) {
        return renderEditCardPage(req, res, {
          errorMessage: 'クレジットカードの締め日を入力してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (closingDay === null) {
        return renderEditCardPage(req, res, {
          errorMessage: '締め日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (!req.body.paymentDay) {
        return renderEditCardPage(req, res, {
          errorMessage: 'クレジットカードの支払日を入力してください。',
          formValues,
          statusCode: 400,
        });
      }
      if (paymentDay === null) {
        return renderEditCardPage(req, res, {
          errorMessage: '支払日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      formValues.billingDay = '';
    } else {
      closingDay = null;
      paymentDay = null;
      if (req.body.billingDay && billingDay === null) {
        return renderEditCardPage(req, res, {
          errorMessage: '課金日は1〜31の範囲で指定してください。',
          formValues,
          statusCode: 400,
        });
      }
      formValues.closingDay = '';
      formValues.paymentDay = '';
    }
    if (req.body.limitAmount && limitAmount === null) {
      return renderEditCardPage(req, res, {
        errorMessage: '利用上限額は数値で入力してください。',
        formValues,
        statusCode: 400,
      });
    }
    await updateCard({
      id: cardId,
      userId: sessionUid,
      cardName,
      cardBrand,
      last4Digits,
      billingDay,
      closingDay,
      paymentDay,
      limitAmount,
      cardType,
    });
    setFlashMessage(res, 'success', 'カードを更新しました。');
    res.redirect('/card');
  })
);

router.post(
  '/delete/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const cardId = req.params.id;
    try {
      await deleteCard(cardId, sessionUid);
      setFlashMessage(res, 'success', 'カードを削除しました。');
    } catch (err) {
      console.error('Failed to delete card', err);
      setFlashMessage(res, 'error', 'カードの削除に失敗しました。');
    }
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
    const cards = (await listCardsByUser(sessionUid)).map((card) =>
      Object.assign({}, card, {
        cardType: normalizeCardType(card.cardType),
        cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
      })
    );
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }
    const defaultValues = {
      cardId: req.query.cardId || (cards[0]?.id || ''),
      currency: 'JPY',
      cycle: 'monthly',
      paymentStartDate: formatIsoDate(new Date()),
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
    let billingDay = parseBillingDay(req.body.billingDay);
    const currency = normalizeCurrency(req.body.currency);
    const cycle = req.body.cycle === 'yearly' ? 'yearly' : 'monthly';
    const registeredEmail = (req.body.registeredEmail || '').trim();
    const paymentStartDate = parseDateInput(req.body.paymentStartDate);
    const notes = (req.body.notes || '').trim();
    const cards = (await listCardsByUser(sessionUid)).map((card) =>
      Object.assign({}, card, {
        cardType: normalizeCardType(card.cardType),
        cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
      })
    );
    const formValues = {
      cardId,
      serviceName,
      amount: req.body.amount,
      billingDay: req.body.billingDay,
      currency,
      cycle,
      registeredEmail,
      paymentStartDate: req.body.paymentStartDate,
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
    const card = cards.find((item) => item.id === cardId) || (await getCardById(cardId));
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
    const cardType = normalizeCardType(card.cardType);
    if (cardType !== 'debit') {
      billingDay = null;
      formValues.billingDay = '';
    } else if (req.body.billingDay && billingDay === null) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: '課金日は1〜31の範囲で指定してください。',
        formValues,
        statusCode: 400,
      });
    }
    if (!paymentStartDate) {
      return renderAddSubscriptionPage(req, res, {
        cards,
        errorMessage: '支払い開始日を入力してください。',
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
      paymentStartDate,
      notes,
    });
    setFlashMessage(res, 'success', 'サブスクリプションを追加しました。');
    res.redirect('/card');
  })
);

module.exports = router;
