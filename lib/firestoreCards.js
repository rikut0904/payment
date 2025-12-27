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

function normalizeCardType(value) {
  return value === 'debit' ? 'debit' : 'credit';
}

function toFirestoreDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  let dateValue = value;
  if (!(value instanceof Date)) {
    dateValue = new Date(value);
  }
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return null;
  }
  return admin.firestore.Timestamp.fromDate(dateValue);
}

async function verifyOwnership(collectionName, docId, userId) {
  if (!collectionName) throw new Error('collectionName is required');
  if (!docId) throw new Error('docId is required');
  if (!userId) throw new Error('userId is required');
  const docRef = getDb().collection(collectionName).doc(docId);
  const snapshot = await docRef.get();
  if (!snapshot.exists) {
    throw new Error('document not found');
  }
  const existing = snapshot.data();
  if (existing.userId !== userId) {
    throw new Error('unauthorized');
  }
  return { docRef, existing };
}

function buildCardPayload(
  { userId, cardName, cardBrand, last4Digits, billingDay, closingDay, paymentDay, limitAmount, cardType },
  { includeUserId = false } = {}
) {
  const payload = {
    cardName,
    cardBrand: cardBrand || 'その他',
    last4Digits: (last4Digits || '').slice(-4),
    billingDay: normalizeBillingDay(billingDay),
    closingDay: normalizeBillingDay(closingDay),
    paymentDay: normalizeBillingDay(paymentDay),
    limitAmount: normalizeAmount(limitAmount),
    cardType: normalizeCardType(cardType),
  };
  if (includeUserId) {
    payload.userId = userId;
  }
  return payload;
}

async function createCard({
  userId,
  cardName,
  cardBrand,
  last4Digits,
  billingDay,
  closingDay,
  paymentDay,
  limitAmount,
  cardType,
}) {
  if (!userId) throw new Error('userId is required');
  if (!cardName) throw new Error('cardName is required');
  const payload = Object.assign(
    {},
    buildCardPayload(
      { userId, cardName, cardBrand, last4Digits, billingDay, closingDay, paymentDay, limitAmount, cardType },
      { includeUserId: true }
    ),
    { createdAt: admin.firestore.FieldValue.serverTimestamp() }
  );
  await getDb().collection('cards').add(payload);
}

async function updateCard({
  id,
  userId,
  cardName,
  cardBrand,
  last4Digits,
  billingDay,
  closingDay,
  paymentDay,
  limitAmount,
  cardType,
}) {
  if (!id) throw new Error('cardId is required');
  if (!userId) throw new Error('userId is required');
  if (!cardName) throw new Error('cardName is required');
  const { docRef } = await verifyOwnership('cards', id, userId);
  const payload = Object.assign(
    {},
    buildCardPayload({ userId, cardName, cardBrand, last4Digits, billingDay, closingDay, paymentDay, limitAmount, cardType }),
    { updatedAt: admin.firestore.FieldValue.serverTimestamp() }
  );
  await docRef.update(payload);
}

async function deleteCard(cardId, userId) {
  if (!cardId) throw new Error('cardId is required');
  if (!userId) throw new Error('userId is required');
  const { docRef } = await verifyOwnership('cards', cardId, userId);
  await docRef.delete();
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
  currency,
  notes,
  cycle,
  registeredEmail,
  paymentStartDate,
}) {
  if (!userId) throw new Error('userId is required');
  if (!cardId) throw new Error('cardId is required');
  if (!serviceName) throw new Error('serviceName is required');
  const normalizedAmount = normalizeAmount(amount);
  if (normalizedAmount === null || normalizedAmount < 0) {
    throw new Error('amount is invalid');
  }
  const startDateTimestamp = toFirestoreDate(paymentStartDate);
  if (!startDateTimestamp) {
    throw new Error('paymentStartDate is invalid');
  }
  const payload = {
    userId,
    cardId,
    serviceName,
    amount: normalizedAmount,
    currency: currency || 'JPY',
    notes: notes || '',
    cycle: cycle || 'monthly',
    registeredEmail: (registeredEmail || '').trim(),
    paymentStartDate: startDateTimestamp,
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

async function getSubscriptionById(subscriptionId) {
  if (!subscriptionId) {
    return null;
  }
  const doc = await getDb().collection('subscriptions').doc(subscriptionId).get();
  if (!doc.exists) {
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function updateSubscription({
  id,
  userId,
  cardId,
  serviceName,
  amount,
  currency,
  cycle,
  registeredEmail,
  paymentStartDate,
  notes,
}) {
  if (!id) throw new Error('subscriptionId is required');
  if (!userId) throw new Error('userId is required');
  const { docRef } = await verifyOwnership('subscriptions', id, userId);
  if (!cardId) throw new Error('cardId is required');
  if (!serviceName) throw new Error('serviceName is required');
  const normalizedAmount = normalizeAmount(amount);
  if (normalizedAmount === null || normalizedAmount < 0) {
    throw new Error('amount is invalid');
  }
  const startDateTimestamp = toFirestoreDate(paymentStartDate);
  if (!startDateTimestamp) {
    throw new Error('paymentStartDate is invalid');
  }
  const payload = {
    userId,
    cardId,
    serviceName,
    amount: normalizedAmount,
    currency: currency || 'JPY',
    cycle: cycle || 'monthly',
    registeredEmail: (registeredEmail || '').trim(),
    notes: notes || '',
    paymentStartDate: startDateTimestamp,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await docRef.update(payload);
}

async function deleteSubscription(subscriptionId, userId) {
  if (!subscriptionId) throw new Error('subscriptionId is required');
  if (!userId) throw new Error('userId is required');
  const { docRef } = await verifyOwnership('subscriptions', subscriptionId, userId);
  await docRef.delete();
}

module.exports = {
  createCard,
  updateCard,
  deleteCard,
  listCardsByUser,
  getCardById,
  createSubscription,
  listSubscriptionsByUser,
  getSubscriptionById,
  updateSubscription,
  deleteSubscription,
};
