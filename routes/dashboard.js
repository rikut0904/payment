var express = require('express');
var router = express.Router();
var { listCardsByUser, listSubscriptionsByUser } = require('../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../lib/exchangeRates');
var { asyncHandler } = require('./card/helpers');
var { buildUpcomingPaymentMonths, calculateUpcomingPayments, summarizeMonthlyTotals } = require('./card/payments');
var { formatCurrency, startOfDay } = require('./card/utils');

function toJpyAmount(payment, exchangeRates) {
  // 支払金額をJPYに変換し、失敗時は0にする。
  const rawAmount = Number(payment.amount) || 0;
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return 0;
  }
  const normalizedCurrency = (payment.currency || 'JPY').toUpperCase();
  if (normalizedCurrency === 'JPY') {
    return rawAmount;
  }
  if (!exchangeRates) {
    return 0;
  }
  const converted = convertToJpy(rawAmount, normalizedCurrency, exchangeRates);
  return converted === null ? 0 : converted;
}

function correctSummarizeMonthlyTotals(payments, exchangeRates) {
  // 安全にJPY換算して月別合計を作る。
  const summaryMap = new Map();
  payments.forEach((payment) => {
    const existing = summaryMap.get(payment.monthKey) || {
      monthKey: payment.monthKey,
      monthLabel: payment.monthLabel,
      totalAmount: 0,
    };
    existing.totalAmount += toJpyAmount(payment, exchangeRates);
    summaryMap.set(payment.monthKey, existing);
  });
  const totals = Array.from(summaryMap.values());
  totals.forEach((item) => {
    item.formattedTotal = formatCurrency(item.totalAmount, 'JPY');
  });
  return totals.sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

// ダッシュボードの合計・推移を表示する。
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
    const cardMap = new Map(cards.map((card) => [card.id, card]));
    const today = startOfDay(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const summaryPayments = calculateUpcomingPayments(subscriptions, cardMap, {
      startDateLimit: monthStart,
      monthsLimit: 1,
    });
    const monthlyTotalsRaw = correctSummarizeMonthlyTotals(summaryPayments, exchangeRates);
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(summaryPayments, 1);
    const currentMonthKey = upcomingPaymentMonths[0]?.monthKey;
    const monthlyTotal = monthlyTotalsRaw.find((item) => item.monthKey === currentMonthKey) || {
      monthKey: currentMonthKey,
      monthLabel: upcomingPaymentMonths[0]?.monthLabel || '',
      totalAmount: 0,
      formattedTotal: formatCurrency(0, 'JPY'),
    };
    const currentMonthPayments = summaryPayments.filter((payment) => payment.monthKey === currentMonthKey);
    const hasConversionWarning = currentMonthPayments.some((payment) => {
      const normalizedCurrency = (payment.currency || 'JPY').toUpperCase();
      if (normalizedCurrency === 'JPY') {
        return false;
      }
      if (!exchangeRates) {
        return true;
      }
      return convertToJpy(Number(payment.amount) || 0, normalizedCurrency, exchangeRates) === null;
    });
    const totals = currentMonthPayments.reduce(
      (acc, payment) => {
        const amount = toJpyAmount(payment, exchangeRates);
        if (payment.cardType === 'debit') {
          acc.debit += amount;
        } else {
          acc.credit += amount;
        }
        return acc;
      },
      { debit: 0, credit: 0 }
    );
    const debitTotalAmount = totals.debit;
    const creditTotalAmount = totals.credit;
    const debitTotalFormatted = formatCurrency(debitTotalAmount, 'JPY');
    const creditTotalFormatted = formatCurrency(creditTotalAmount, 'JPY');

    const historyMonths = [];
    for (let i = 4; i >= 0; i -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      historyMonths.push({
        date,
        monthKey,
        monthLabel: `${date.getFullYear()}年${date.getMonth() + 1}月`,
      });
    }
    const historyPayments = calculateUpcomingPayments(subscriptions, cardMap, {
      startDateLimit: historyMonths[0].date,
      monthsLimit: 5,
    });
    const historyTotalsRaw = correctSummarizeMonthlyTotals(historyPayments, exchangeRates);
    const historyTotals = historyMonths.map((month) => {
      const matched = historyTotalsRaw.find((item) => item.monthKey === month.monthKey);
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
    const historyMaxTotal = historyTotals.reduce((max, item) => Math.max(max, item.totalAmount || 0), 0);

    res.render('dashboard/index', {
      title: 'ダッシュボード',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      monthlyTotal,
      debitTotalFormatted,
      creditTotalFormatted,
      hasConversionWarning,
      currentMonthPayments,
      historyTotals,
      historyMaxTotal,
    });
  })
);

module.exports = router;
