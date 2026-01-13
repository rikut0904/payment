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

// ============================================================
// ダッシュボードのGETルート
// ============================================================
// 機能: 今月の支払サマリーと過去5ヶ月の推移グラフを表示
// - 今月の支払合計（デビット/クレジット別）
// - 過去5ヶ月の月別支払推移グラフ
// - 今月の支払予定一覧
// ============================================================
router.get(
  '/',
  asyncHandler(async function (req, res) {
    const sessionUid = req.session?.user?.uid;
    if (!sessionUid) {
      return res.redirect('/login');
    }

    // ============================================================
    // ステップ1: 必要なデータを並列取得
    // ============================================================
    // - ユーザーのカード一覧
    // - ユーザーのサブスクリプション一覧
    // - 為替レート（外貨建てサブスクをJPYに換算するため）
    const exchangeRatesPromise = getExchangeRates().catch((err) => {
      console.error('Failed to load exchange rates', err);
      return null; // 為替レート取得失敗時はnullを返す（換算しない）
    });
    const [cards, subscriptions, exchangeRates] = await Promise.all([
      listCardsByUser(sessionUid),
      listSubscriptionsByUser(sessionUid),
      exchangeRatesPromise,
    ]);

    // カードIDをキーとしたMapを作成（高速検索用）
    const cardMap = new Map(cards.map((card) => [card.id, card]));

    // ============================================================
    // ステップ2: 今月のサマリーデータを準備
    // ============================================================
    const today = startOfDay(new Date());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1); // 今月の1日

    // 今月の支払予定を計算（月初から1ヶ月分）
    const summaryPayments = calculateUpcomingPayments(subscriptions, cardMap, {
      startDateLimit: monthStart, // 今月1日から
      monthsLimit: 1,             // 1ヶ月分
    });
    // 月別合計を集計（外貨をJPYに換算）
    const monthlyTotalsRaw = correctSummarizeMonthlyTotals(summaryPayments, exchangeRates);

    // 支払月リストを構築
    const upcomingPaymentMonths = buildUpcomingPaymentMonths(summaryPayments, 1);
    const currentMonthKey = upcomingPaymentMonths[0]?.monthKey; // 例: "2025-01"

    // 今月の合計額を取得
    const monthlyTotal = monthlyTotalsRaw.find((item) => item.monthKey === currentMonthKey) || {
      monthKey: currentMonthKey,
      monthLabel: upcomingPaymentMonths[0]?.monthLabel || '',
      totalAmount: 0,
      formattedTotal: formatCurrency(0, 'JPY'),
    };

    // 今月の支払予定リスト
    const currentMonthPayments = summaryPayments.filter((payment) => payment.monthKey === currentMonthKey);

    // ============================================================
    // 為替換算の警告チェック
    // ============================================================
    // 外貨建てサブスクが換算できない場合に警告を表示
    const hasConversionWarning = currentMonthPayments.some((payment) => {
      const normalizedCurrency = (payment.currency || 'JPY').toUpperCase();
      if (normalizedCurrency === 'JPY') {
        return false; // JPYは換算不要
      }
      if (!exchangeRates) {
        return true; // 為替レート取得失敗
      }
      return convertToJpy(Number(payment.amount) || 0, normalizedCurrency, exchangeRates) === null;
    });

    // ============================================================
    // デビット/クレジット別の合計を計算
    // ============================================================
    const totals = currentMonthPayments.reduce(
      (acc, payment) => {
        const amount = toJpyAmount(payment, exchangeRates); // JPYに換算
        if (payment.cardType === 'debit') {
          acc.debit += amount;
        } else {
          acc.credit += amount;
        }
        return acc;
      },
      { debit: 0, credit: 0 } // 初期値
    );
    const debitTotalAmount = totals.debit;
    const creditTotalAmount = totals.credit;
    const debitTotalFormatted = formatCurrency(debitTotalAmount, 'JPY');
    const creditTotalFormatted = formatCurrency(creditTotalAmount, 'JPY');

    // ============================================================
    // ステップ3: 過去5ヶ月の推移グラフデータを準備
    // ============================================================
    // グラフ表示用の月リストを作成（過去4ヶ月 + 今月 = 5ヶ月）
    const historyMonths = [];
    for (let i = 4; i >= 0; i -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1); // i=4なら4ヶ月前、i=0なら今月
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // 例: "2024-09"
      historyMonths.push({
        date,
        monthKey,
        monthLabel: `${date.getFullYear()}年${date.getMonth() + 1}月`, // 例: "2024年9月"
      });
    }

    // 過去5ヶ月分の支払予定を計算
    const historyPayments = calculateUpcomingPayments(subscriptions, cardMap, {
      startDateLimit: historyMonths[0].date, // 4ヶ月前の1日から
      monthsLimit: 5,                         // 5ヶ月分
    });

    // 月別の合計を集計（外貨をJPYに換算）
    const historyTotalsRaw = correctSummarizeMonthlyTotals(historyPayments, exchangeRates);

    // ============================================================
    // グラフ用データの整形
    // ============================================================
    // 各月のデータを整形（支払いがない月は0円として扱う）
    const historyTotals = historyMonths.map((month) => {
      const matched = historyTotalsRaw.find((item) => item.monthKey === month.monthKey);
      if (matched) {
        return matched; // 支払いがある月
      }
      // 支払いがない月は0円
      return {
        monthKey: month.monthKey,
        monthLabel: month.monthLabel,
        totalAmount: 0,
        formattedTotal: formatCurrency(0, 'JPY'),
      };
    });

    // グラフの高さ計算用：5ヶ月の中の最大値を取得
    // 各棒グラフの高さは (金額 / 最大値 * 100) % で計算する
    const historyMaxTotal = historyTotals.reduce((max, item) => Math.max(max, item.totalAmount || 0), 0);

    // ============================================================
    // ステップ4: テンプレートにデータを渡してレンダリング
    // ============================================================
    res.render('dashboard/index', {
      title: 'ダッシュボード',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      // 今月のサマリー
      monthlyTotal,              // 今月の合計額 { monthKey, monthLabel, totalAmount, formattedTotal }
      debitTotalFormatted,       // デビットカード合計（フォーマット済み）
      creditTotalFormatted,      // クレジットカード合計（フォーマット済み）
      hasConversionWarning,      // 為替換算の警告フラグ
      currentMonthPayments,      // 今月の支払予定リスト
      // グラフデータ
      historyTotals,             // 過去5ヶ月の月別合計 [{ monthKey, monthLabel, totalAmount, formattedTotal }, ...]
      historyMaxTotal,           // 5ヶ月の中の最大値（グラフの高さ計算用）
    });
  })
);

module.exports = router;
