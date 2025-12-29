var express = require('express');
var router = express.Router();
var {
  createCard,
  listCardsByUser,
  getCardById,
  updateCard,
  deleteCard,
  listSubscriptionsByUser,
} = require('../../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../../lib/exchangeRates');
var {
  CARD_TYPE_LABELS,
  CARD_TYPE_OPTIONS,
  SUPPORTED_CARD_BRANDS,
  SUPPORTED_CURRENCIES,
} = require('./constants');
var {
  formatCurrency,
  formatDateForDisplay,
  formatDayDisplay,
  formatIsoDate,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./utils');
var {
  buildUpcomingPaymentMonths,
  calculateUpcomingPayments,
  computeNextPaymentDate,
  groupSubscriptionsByCard,
  summarizeMonthlyTotals,
} = require('./payments');
var { consumeFlashMessage, setFlashMessage } = require('./message');
var { validateCardPayload } = require('./validators');
var { asyncHandler, renderAddCardPage, renderEditCardPage } = require('./helpers');

router.get(
  '/',
  asyncHandler(async function (req, res) {
    // カード一覧と支払予定を表示する。
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
    const message = consumeFlashMessage(req, res);
    const noticeMessage = message?.type === 'success' ? message.message : '';
    const errorMessage = message?.type === 'error' ? message.message : '';
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
    // カード追加フォームを表示する。
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
    // 入力を検証してカードを作成する。
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
    // 既存値を使って編集フォームを表示する。
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
    // 入力を検証してカードを更新する。
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
    // 所有者確認後にカードを削除する。
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

module.exports = router;
