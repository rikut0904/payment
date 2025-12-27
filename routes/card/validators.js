const { getCardById } = require('../../lib/firestoreCards');
const { SUPPORTED_CARD_BRANDS } = require('./constants');
const { parseAmount, parseBillingDay, normalizeCardType, normalizeCurrency, parseDateInput } = require('./utils');

function validateCardPayload(body, { formValuesBase = {} } = {}) {
  const cardName = (body.cardName || '').trim();
  const cardBrand = SUPPORTED_CARD_BRANDS.includes(body.cardBrand) ? body.cardBrand : 'その他';
  const last4Digits = (body.last4Digits || '').trim();
  let billingDay = parseBillingDay(body.billingDay);
  let closingDay = parseBillingDay(body.closingDay);
  let paymentDay = parseBillingDay(body.paymentDay);
  const limitAmount = parseAmount(body.limitAmount);
  const cardType = normalizeCardType(body.cardType);
  const formValues = Object.assign({}, formValuesBase, {
    cardName,
    cardBrand,
    last4Digits,
    billingDay: body.billingDay,
    closingDay: body.closingDay,
    paymentDay: body.paymentDay,
    limitAmount: body.limitAmount,
    cardType,
  });

  if (!cardName) {
    return { errorMessage: 'カード名を入力してください。', formValues };
  }
  if (last4Digits && !/^\d{4}$/.test(last4Digits)) {
    return { errorMessage: 'カード番号下4桁は4桁の数字で入力してください。', formValues };
  }
  if (cardType === 'credit') {
    billingDay = null;
    if (!body.closingDay) {
      return { errorMessage: 'クレジットカードの締め日を入力してください。', formValues };
    }
    if (closingDay === null) {
      return { errorMessage: '締め日は1〜31の範囲で指定してください。', formValues };
    }
    if (!body.paymentDay) {
      return { errorMessage: 'クレジットカードの支払日を入力してください。', formValues };
    }
    if (paymentDay === null) {
      return { errorMessage: '支払日は1〜31の範囲で指定してください。', formValues };
    }
    formValues.billingDay = '';
  } else {
    closingDay = null;
    paymentDay = null;
    if (body.billingDay && billingDay === null) {
      return { errorMessage: '課金日は1〜31の範囲で指定してください。', formValues };
    }
    formValues.closingDay = '';
    formValues.paymentDay = '';
  }
  if (body.limitAmount && limitAmount === null) {
    return { errorMessage: '利用上限額は数値で入力してください。', formValues };
  }

  return {
    payload: {
      cardName,
      cardBrand,
      last4Digits,
      billingDay,
      closingDay,
      paymentDay,
      limitAmount,
      cardType,
    },
    formValues,
  };
}

async function validateSubscriptionPayload(body, { cards, sessionUid }) {
  const cardId = (body.cardId || '').trim();
  const serviceName = (body.serviceName || '').trim();
  const amount = parseAmount(body.amount);
  const currency = normalizeCurrency(body.currency);
  const cycle = body.cycle === 'yearly' ? 'yearly' : 'monthly';
  const registeredEmail = (body.registeredEmail || '').trim();
  const paymentStartDate = parseDateInput(body.paymentStartDate);
  const notes = (body.notes || '').trim();
  const formValues = {
    cardId,
    serviceName,
    amount: body.amount,
    currency,
    cycle,
    registeredEmail,
    paymentStartDate: body.paymentStartDate,
    notes,
  };

  if (!cardId) {
    return { errorMessage: 'サブスクリプションを紐付けるカードを選択してください。', formValues };
  }
  const card = cards.find((item) => item.id === cardId) || (await getCardById(cardId));
  if (!card || card.userId !== sessionUid) {
    return { errorMessage: '指定されたカードが存在しません。', formValues };
  }
  if (!serviceName) {
    return { errorMessage: 'サブスクリプション名を入力してください。', formValues };
  }
  if (amount === null || amount <= 0) {
    return { errorMessage: '支払額は0より大きい数値で入力してください。', formValues };
  }
  if (!paymentStartDate) {
    return { errorMessage: '支払い開始日を入力してください。', formValues };
  }

  return {
    payload: {
      cardId,
      serviceName,
      amount,
      currency,
      cycle,
      registeredEmail,
      paymentStartDate,
      notes,
    },
    formValues,
  };
}

module.exports = {
  validateCardPayload,
  validateSubscriptionPayload,
};
