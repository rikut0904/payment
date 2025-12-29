const { SUPPORTED_CURRENCIES } = require('./constants');
const { parseAmount, parseBillingDay } = require('../../lib/numberUtils');

function formatDayDisplay(value) {
  // 日付表示用の文字列を作る。
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 1) {
    return '未設定';
  }
  return `${numeric}日`;
}

function normalizeCurrency(value) {
  // 通貨入力をサポート値に正規化する。
  const trimmed = (value || '').trim().toUpperCase();
  if (SUPPORTED_CURRENCIES.includes(trimmed)) {
    return trimmed;
  }
  return 'JPY';
}

function normalizeCardType(value) {
  // カード種別を正規化する。
  return value === 'debit' ? 'debit' : 'credit';
}

function formatCurrency(amount, currency = 'JPY') {
  // 金額を通貨表記で整形する。
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(safeAmount);
  } catch (err) {
    return `${safeAmount.toLocaleString('ja-JP')} ${currency}`;
  }
}

function getDaysInMonth(year, monthIndex) {
  // 指定月の日数を返す。
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDayToMonth(year, monthIndex, targetDay) {
  // 日付を月内の最大日に丸める。
  const safeDay = Math.max(1, Math.min(31, targetDay));
  return Math.min(safeDay, getDaysInMonth(year, monthIndex));
}

function startOfDay(date) {
  // 日付をその日の開始時刻に揃える。
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDateInput(value) {
  // 日付入力をDateに変換する。
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
  // 日付をYYYY-MM-DD形式にする。
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

function formatDateForDisplay(date) {
  // 日付を日本語表示に整形する。
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day} (${weekdays[date.getDay()]})`;
}

module.exports = {
  parseBillingDay,
  parseAmount,
  formatDayDisplay,
  normalizeCurrency,
  normalizeCardType,
  formatCurrency,
  getDaysInMonth,
  clampDayToMonth,
  startOfDay,
  parseDateInput,
  formatIsoDate,
  formatDateForDisplay,
};
