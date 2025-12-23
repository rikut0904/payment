const https = require('https');

const API_URL = process.env.EXCHANGE_RATE_API_URL || 'https://open.er-api.com/v6/latest/USD';
const CACHE_TTL_MS = 60 * 60 * 1000;

let cachedRates = null;
let cacheExpiresAt = 0;

function fetchLatestRates() {
  return new Promise((resolve, reject) => {
    https
      .get(API_URL, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const json = JSON.parse(body);
              resolve(json);
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Failed to load exchange rates (status ${res.statusCode})`));
          }
        });
      })
      .on('error', reject);
  });
}

function normalizeRates(payload) {
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
