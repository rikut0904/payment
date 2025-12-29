const { fetchJson, isTimeoutError } = require('./httpClient');

const API_URL = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 60 * 60 * 1000;

let cachedRates = null;
let cacheExpiresAt = 0;

async function fetchLatestRates() {
  // 外部APIから最新の為替レートを取得する。
  try {
    return await fetchJson(API_URL, { headers: { Accept: 'application/json' } });
  } catch (err) {
    const message = isTimeoutError(err)
      ? 'Exchange rate request timed out'
      : 'Failed to load exchange rates';
    const wrapped = new Error(message);
    wrapped.cause = err;
    throw wrapped;
  }
}

function normalizeRates(payload) {
  // APIレスポンスを正規化して不正ならnullを返す。
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (payload.result && payload.result !== 'success') {
    return null;
  }
  const base = payload.base_code || payload.base || 'USD';
  const rates = payload.rates || {};
  if (!rates.JPY) {
    return null;
  }
  return { base, rates };
}

async function getExchangeRates() {
  // キャッシュを返すか、最新レートを取得する。
  if (cachedRates && cacheExpiresAt > Date.now()) {
    return cachedRates;
  }
  const payload = await fetchLatestRates();
  const normalized = normalizeRates(payload);
  if (!normalized) {
    throw new Error('Exchange rate payload is invalid');
  }
  cachedRates = normalized;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return normalized;
}

function convertToJpy(amount, currency, exchangeRates) {
  // 指定通貨をJPYに換算する。
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return null;
  }
  const normalizedCurrency = (currency || 'JPY').toUpperCase();
  if (normalizedCurrency === 'JPY') {
    return numericAmount;
  }
  const rates = exchangeRates?.rates;
  if (!rates) {
    return null;
  }
  const baseCurrency = (exchangeRates.base || 'USD').toUpperCase();
  const rateForJpy = Number(rates.JPY);
  if (!Number.isFinite(rateForJpy) || rateForJpy <= 0) {
    return null;
  }
  if (normalizedCurrency === baseCurrency) {
    return numericAmount * rateForJpy;
  }
  const rateForSource = Number(rates[normalizedCurrency]);
  if (!Number.isFinite(rateForSource) || rateForSource <= 0) {
    return null;
  }
  return numericAmount * (rateForJpy / rateForSource);
}

module.exports = {
  getExchangeRates,
  convertToJpy,
};
