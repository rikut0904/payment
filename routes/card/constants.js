const SUPPORTED_CARD_BRANDS = ['VISA', 'Mastercard', 'JCB', 'American Express', 'その他'];
const SUPPORTED_CURRENCIES = ['JPY', 'USD'];
const CARD_TYPE_OPTIONS = [
  { value: 'credit', label: 'クレジットカード' },
  { value: 'debit', label: 'デビットカード' },
];
const CARD_TYPE_LABELS = CARD_TYPE_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});
const UPCOMING_MONTHS = 4;
const MAX_UPCOMING_EVENTS = 24;
const FLASH_COOKIE_NAME = 'card_notice';
const FLASH_TTL_MS = 10 * 1000;

module.exports = {
  SUPPORTED_CARD_BRANDS,
  SUPPORTED_CURRENCIES,
  CARD_TYPE_OPTIONS,
  CARD_TYPE_LABELS,
  UPCOMING_MONTHS,
  MAX_UPCOMING_EVENTS,
  FLASH_COOKIE_NAME,
  FLASH_TTL_MS,
};
