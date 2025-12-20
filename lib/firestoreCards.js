const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

function normalizeBillingDay(value) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 31) {
    return null;
  }
  return parsed;
}

function normalizeAmount(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function createCard({ userId, cardName, cardBrand, last4Digits, billingDay, limitAmount }) {
  if (!userId) throw new Error('userId is required');
  if (!cardName) throw new Error('cardName is required');
  const payload = {
    userId,
    cardName,
    cardBrand: cardBrand || 'その他',
    last4Digits: (last4Digits || '').slice(-4),
    billingDay: normalizeBillingDay(billingDay),
    limitAmount: normalizeAmount(limitAmount),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await getDb().collection('cards').add(payload);
}

async function listCardsByUser(userId) {
  if (!userId) {
    return [];
  }
  const snapshot = await getDb().collection('cards').where('userId', '==', userId).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
}

async function getCardById(cardId) {
  if (!cardId) {
    return null;
  }
  const doc = await getDb().collection('cards').doc(cardId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function createSubscription({
  userId,
  cardId,
  serviceName,
  amount,
  billingDay,
  currency,
  notes,
  cycle,
  registeredEmail,
}) {
  if (!userId) throw new Error('userId is required');
  if (!cardId) throw new Error('cardId is required');
  if (!serviceName) throw new Error('serviceName is required');
  const normalizedAmount = normalizeAmount(amount);
  if (normalizedAmount === null || normalizedAmount < 0) {
    throw new Error('amount is invalid');
  }
  const payload = {
    userId,
    cardId,
    serviceName,
    amount: normalizedAmount,
    billingDay: normalizeBillingDay(billingDay),
    currency: currency || 'JPY',
    notes: notes || '',
    cycle: cycle || 'monthly',
    registeredEmail: (registeredEmail || '').trim(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await getDb().collection('subscriptions').add(payload);
}

async function listSubscriptionsByUser(userId) {
  if (!userId) {
    return [];
  }
  const snapshot = await getDb().collection('subscriptions').where('userId', '==', userId).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => timestampToMillis(b.createdAt) - timestampToMillis(a.createdAt));
}

module.exports = {
  createCard,
  listCardsByUser,
  getCardById,
  createSubscription,
  listSubscriptionsByUser,
};
