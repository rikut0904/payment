const { convertToJpy } = require('../../lib/exchangeRates');
const { CARD_TYPE_LABELS, MAX_UPCOMING_EVENTS, UPCOMING_MONTHS } = require('./constants');
const {
  clampDayToMonth,
  formatCurrency,
  formatDateForDisplay,
  normalizeCardType,
  parseDateInput,
  startOfDay,
} = require('./utils');

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

function computeNextPaymentDate(subscription, card, referenceDate) {
  const startDate = parseDateInput(subscription.paymentStartDate);
  if (!startDate) {
    return null;
  }
  const cardType = normalizeCardType(card?.cardType);
  const paymentDay = cardType === 'credit' ? resolvePaymentDay(card) : null;
  const cycle = subscription.cycle === 'yearly' ? 'yearly' : 'monthly';
  let nextDate =
    cardType === 'credit'
      ? alignDateToPaymentDay(startDate, paymentDay)
      : startOfDay(new Date(startDate.getTime()));
  if (!nextDate) {
    return null;
  }
  let guard = 0;
  while (nextDate < referenceDate && guard < 120) {
    nextDate =
      cardType === 'credit'
        ? addCycleWithPaymentDay(nextDate, cycle, paymentDay)
        : addCycle(nextDate, cycle);
    guard += 1;
    if (!nextDate) {
      return null;
    }
  }
  return nextDate;
}

function calculateUpcomingPayments(subscriptions, cardMap, options = {}) {
  const baseStart = options.startDateLimit ? startOfDay(options.startDateLimit) : startOfDay(new Date());
  const monthsLimit = Number.isFinite(options.monthsLimit) ? options.monthsLimit : UPCOMING_MONTHS;
  const horizon = new Date(baseStart.getFullYear(), baseStart.getMonth() + monthsLimit, 0);
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
    if (nextDate < baseStart) {
      let guard = 0;
      while (nextDate < baseStart && guard < 60) {
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

module.exports = {
  addCycle,
  resolvePaymentDay,
  alignDateToPaymentDay,
  addCycleWithPaymentDay,
  computeNextPaymentDate,
  calculateUpcomingPayments,
  summarizeMonthlyTotals,
  buildUpcomingPaymentMonths,
  groupSubscriptionsByCard,
};
