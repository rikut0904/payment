var express = require('express');
var router = express.Router();
var { listCardsByUser, listSubscriptionsByUser } = require('../lib/firestoreCards');
var { getExchangeRates, convertToJpy } = require('../lib/exchangeRates');
var { asyncHandler } = require('./card/helpers');
var { buildUpcomingPaymentMonths, calculateUpcomingPayments, summarizeMonthlyTotals } = require('./card/payments');
var { formatCurrency, startOfDay } = require('./card/utils');

function toJpyAmount(payment, exchangeRates) {
  const rawAmount = Number(payment.amount) || 0;
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return 0;
  }
  const normalizedCurrency = (payment.currency || 'JPY').toUpperCase();
  if (normalizedCurrency === 'JPY') {
    return rawAmount;
  }
  if (!exchangeRates) {
    return rawAmount;
  }
  const converted = convertToJpy(rawAmount, normalizedCurrency, exchangeRates);
  return converted === null ? rawAmount : converted;
}

/* GET dashboard page. */
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
    const monthlyTotalsRaw = summarizeMonthlyTotals(summaryPayments, exchangeRates);
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(summaryPayments, 1);
    const currentMonthKey = upcomingPaymentMonths[0]?.monthKey;
    const monthlyTotal = monthlyTotalsRaw.find((item) => item.monthKey === currentMonthKey) || {
      monthKey: currentMonthKey,
      monthLabel: upcomingPaymentMonths[0]?.monthLabel || '',
      totalAmount: 0,
      formattedTotal: formatCurrency(0, 'JPY'),
    };
    const currentMonthPayments = summaryPayments.filter((payment) => payment.monthKey === currentMonthKey);
    const debitTotalAmount = currentMonthPayments
      .filter((payment) => payment.cardType === 'debit')
      .reduce((sum, payment) => sum + toJpyAmount(payment, exchangeRates), 0);
    const creditTotalAmount = currentMonthPayments
      .filter((payment) => payment.cardType === 'credit')
      .reduce((sum, payment) => sum + toJpyAmount(payment, exchangeRates), 0);
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
    const historyTotalsRaw = summarizeMonthlyTotals(historyPayments, exchangeRates);
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
      currentMonthPayments,
      historyTotals,
      historyMaxTotal,
    });
  })
);

module.exports = router;
