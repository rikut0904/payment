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
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
} = require('../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../lib/exchangeRates');
var {
  CARD_TYPE_LABELS,
  CARD_TYPE_OPTIONS,
  SUPPORTED_CARD_BRANDS,
  SUPPORTED_CURRENCIES,
} = require('./card/constants');
var {
  formatCurrency,
  formatDateForDisplay,
  formatDayDisplay,
  formatIsoDate,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./card/utils');
var {
  buildUpcomingPaymentMonths,
  calculateUpcomingPayments,
  computeNextPaymentDate,
  groupSubscriptionsByCard,
  summarizeMonthlyTotals,
} = require('./card/payments');
var { consumeFlashMessage, setFlashMessage } = require('./card/message');
var { validateCardPayload, validateSubscriptionPayload } = require('./card/validators');

function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function resolveRedirect(target, fallback) {
  if (typeof target !== 'string') {
    return fallback;
  }
  if (!target.startsWith('/') || target.startsWith('//')) {
    return fallback;
  }
  return target;
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
  const cards = await listCardsByUser(userId);
  return cards.map((card) =>
    Object.assign({}, card, {
      cardType: normalizeCardType(card.cardType),
      cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
    })
  );
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
    const referenceDate = startOfDay(new Date());
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
          const nextPaymentDate = computeNextPaymentDate(sub, card, referenceDate);
          return Object.assign({}, sub, {
            paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
            formattedAmount: formatCurrency(Number(sub.amount) || 0, sub.currency || 'JPY'),
            cycleLabel: sub.cycle === 'yearly' ? '年額' : '月額',
            registeredEmail: sub.registeredEmail || '',
            nextPaymentDisplay: nextPaymentDate ? formatDateForDisplay(nextPaymentDate) : '今後の予定なし',
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
    const summaryStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const summaryPayments = calculateUpcomingPayments(subscriptions, cardMap, { startDateLimit: summaryStart }).map((payment) =>
      Object.assign({}, payment, {
        formattedAmount: formatCurrency(payment.amount, payment.currency),
      })
    );
    const monthlyTotalsRaw = summarizeMonthlyTotals(summaryPayments, exchangeRates);
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(summaryPayments);
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
    const Message = consumeFlashMessage(req, res);
    const noticeMessage = Message?.type === 'success' ? Message.message : '';
    const errorMessage = Message?.type === 'error' ? Message.message : '';
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
    const { payload, formValues, errorMessage } = validateCardPayload(req.body);
    if (errorMessage) {
      return renderAddCardPage(req, res, {
        errorMessage,
        formValues,
        statusCode: 400,
      });
    }
    await createCard({
      userId: sessionUid,
      ...payload,
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
    const { payload, formValues, errorMessage } = validateCardPayload(req.body, {
      formValuesBase: { id: cardId },
    });
    if (errorMessage) {
      return renderEditCardPage(req, res, {
        errorMessage,
        formValues,
        statusCode: 400,
      });
    }
    await updateCard({
      id: cardId,
      userId: sessionUid,
      ...payload,
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
    const cards = await fetchUserCardsWithMeta(sessionUid);
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
    renderSubscriptionFormPage(req, res, {
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
    const cards = await fetchUserCardsWithMeta(sessionUid);

    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを追加するには先にカードを登録してください。');
      return res.redirect('/card');
    }

    const { payload, formValues, errorMessage } = await validateSubscriptionPayload(req.body, {
      cards,
      sessionUid,
    });
    if (errorMessage) {
      return renderSubscriptionFormPage(req, res, {
        cards,
        errorMessage,
        formValues,
        statusCode: 400,
      });
    }
    await createSubscription({
      userId: sessionUid,
      ...payload,
    });
    setFlashMessage(res, 'success', 'サブスクリプションを追加しました。');
    res.redirect('/card');
  })
);

router.get(
  '/subscription/:id',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const subscriptionId = req.params.id;
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }
    const fetchedCard = subscription.cardId ? await getCardById(subscription.cardId) : null;
    const card = fetchedCard && fetchedCard.userId === sessionUid ? fetchedCard : null;
    const normalizedCard = card
      ? {
          id: card.id,
          cardName: card.cardName,
          cardTypeLabel: CARD_TYPE_LABELS[normalizeCardType(card.cardType)] || 'クレジットカード',
          last4Digits: card.last4Digits || '----',
        }
      : null;
    const startDate = parseDateInput(subscription.paymentStartDate);
    const nextPaymentDate = computeNextPaymentDate(subscription, card, startOfDay(new Date()));
    const detail = {
      id: subscription.id,
      serviceName: subscription.serviceName,
      amount: Number(subscription.amount) || 0,
      formattedAmount: formatCurrency(Number(subscription.amount) || 0, subscription.currency || 'JPY'),
      currency: (subscription.currency || 'JPY').toUpperCase(),
      cycleLabel: subscription.cycle === 'yearly' ? '年額' : '月額',
      registeredEmail: subscription.registeredEmail || '',
      paymentStartDateDisplay: startDate ? formatDateForDisplay(startDate) : '未設定',
      notes: subscription.notes || '',
      nextPaymentDisplay: nextPaymentDate ? formatDateForDisplay(nextPaymentDate) : '今後の予定なし',
    };
    res.render('card/detail', {
      title: 'サブスクリプション詳細',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      subscription: detail,
      card: normalizedCard,
    });
  })
);

router.get(
  '/subscription/:id/edit',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const subscriptionId = req.params.id;
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }
    const cards = await fetchUserCardsWithMeta(sessionUid);
    if (!cards.length) {
      setFlashMessage(res, 'error', 'サブスクリプションを編集するにはカードが必要です。');
      return res.redirect('/card');
    }
    const redirectRaw = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const safeRedirect = resolveRedirect(redirectRaw, `/card/subscription/${subscription.id}`);
    const formAction = `/card/subscription/${subscription.id}/edit`;
    const cancelUrl = safeRedirect || `/card/subscription/${subscription.id}`;
    const formValues = {
      cardId: subscription.cardId,
      serviceName: subscription.serviceName,
      amount: subscription.amount,
      currency: (subscription.currency || 'JPY').toUpperCase(),
      cycle: subscription.cycle || 'monthly',
      registeredEmail: subscription.registeredEmail || '',
      paymentStartDate: formatIsoDate(subscription.paymentStartDate),
      notes: subscription.notes || '',
    };
    renderSubscriptionFormPage(req, res, {
      cards,
      formValues,
      isEdit: true,
      formAction,
      cancelUrl,
      redirectPath: safeRedirect,
    });
  })
);

router.post(
  '/subscription/:id/edit',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const subscriptionId = req.params.id;
    const existingSubscription = await getSubscriptionById(subscriptionId);
    if (!existingSubscription || existingSubscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }
    const cards = await fetchUserCardsWithMeta(sessionUid);
    if (!cards.length) {
      setFlashMessage(res, 'error', 'カードが登録されていません。');
      return res.redirect('/card');
    }
    const redirectRawQuery = typeof req.query.redirect === 'string' ? req.query.redirect : '';
    const redirectRawBody = typeof req.body.redirect === 'string' ? req.body.redirect : '';
    const safeRedirect = resolveRedirect(redirectRawBody || redirectRawQuery, `/card/subscription/${subscriptionId}`);
    const formAction = `/card/subscription/${subscriptionId}/edit`;
    const cancelUrl = safeRedirect || `/card/subscription/${subscriptionId}`;
    const successRedirect = safeRedirect || `/card/subscription/${subscriptionId}`;
    const renderError = (message, formValues) =>
      renderSubscriptionFormPage(req, res, {
        cards,
        errorMessage: message,
        formValues,
        statusCode: 400,
        isEdit: true,
        formAction,
        cancelUrl,
        redirectPath: safeRedirect,
      });
    const { payload, formValues, errorMessage } = await validateSubscriptionPayload(req.body, {
      cards,
      sessionUid,
    });
    if (errorMessage) {
      return renderError(errorMessage, formValues);
    }
    await updateSubscription({
      id: subscriptionId,
      userId: sessionUid,
      ...payload,
    });
    setFlashMessage(res, 'success', 'サブスクリプションを更新しました。');
    res.redirect(successRedirect);
  })
);

router.post(
  '/subscription/:id/relink',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const subscriptionId = req.params.id;
    const redirectTarget = resolveRedirect(req.body.redirect, '/card');
    const cardId = (req.body.cardId || '').trim();
    if (!cardId) {
      setFlashMessage(res, 'error', '紐づけ先のカードを選択してください。');
      return res.redirect(redirectTarget);
    }
    const subscription = await getSubscriptionById(subscriptionId);
    if (!subscription || subscription.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたサブスクリプションが存在しません。');
      return res.redirect('/card');
    }
    const card = await getCardById(cardId);
    if (!card || card.userId !== sessionUid) {
      setFlashMessage(res, 'error', '指定されたカードが存在しません。');
      return res.redirect(redirectTarget);
    }
    try {
      await updateSubscription({
        id: subscriptionId,
        userId: sessionUid,
        cardId,
        serviceName: subscription.serviceName,
        amount: subscription.amount,
        currency: subscription.currency,
        cycle: subscription.cycle,
        registeredEmail: subscription.registeredEmail,
        paymentStartDate: subscription.paymentStartDate,
        notes: subscription.notes,
      });
      setFlashMessage(res, 'success', 'サブスクリプションを紐づけました。');
    } catch (err) {
      console.error('Failed to relink subscription', err);
      setFlashMessage(res, 'error', 'サブスクリプションの紐づけに失敗しました。');
    }
    res.redirect(redirectTarget);
  })
);

router.post(
  '/subscription/:id/delete',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }
    const subscriptionId = req.params.id;
    try {
      await deleteSubscription(subscriptionId, sessionUid);
      setFlashMessage(res, 'success', 'サブスクリプションを削除しました。');
    } catch (err) {
      console.error('Failed to delete subscription', err);
      setFlashMessage(res, 'error', 'サブスクリプションの削除に失敗しました。');
    }
    res.redirect('/card');
  })
);

module.exports = router;
