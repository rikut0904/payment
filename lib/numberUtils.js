function parseBillingDay(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

module.exports = {
  parseBillingDay,
  parseAmount,
};
