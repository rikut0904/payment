const { SUPPORTED_CURRENCIES } = require('./constants');
const { parseAmount, parseBillingDay } = require('../../lib/numberUtils');

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

function formatDateForDisplay(date) {
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
