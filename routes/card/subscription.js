var express = require('express');
var router = express.Router();
var {
  createSubscription,
  getCardById,
  getSubscriptionById,
  updateSubscription,
  updateSubscriptionCard,
  deleteSubscription,
} = require('../../lib/firestoreCards');
var { CARD_TYPE_LABELS } = require('./constants');
var {
  formatCurrency,
  formatDateForDisplay,
  formatIsoDate,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./utils');
var { computeNextPaymentDate } = require('./payments');
var { setFlashMessage } = require('./flash');
var { validateSubscriptionPayload } = require('./validators');
var {
  asyncHandler,
  fetchUserCardsWithMeta,
  renderSubscriptionFormPage,
  resolveRedirect,
} = require('./helpers');

router.get(
  '/',
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
  '/',
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
  '/:id',
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
  '/:id/edit',
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
  '/:id/edit',
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
  '/:id/relink',
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
      await updateSubscriptionCard({
        id: subscriptionId,
        userId: sessionUid,
        cardId,
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
  '/:id/delete',
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
