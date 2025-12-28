const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

const SORTABLE_FIELDS = ['createdAt', 'userName', 'title', 'date'];
const DOC_ID_FIELD = admin.firestore.FieldPath.documentId();
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function normalizeSortField(field) {
  return SORTABLE_FIELDS.includes(field) ? field : 'createdAt';
}

function normalizeSortOrder(order) {
  return order === 'asc' ? 'asc' : 'desc';
}

function normalizePageSize(size) {
  const parsed = parseInt(size, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed, MAX_PAGE_SIZE);
}

function normalizePageNumber(page) {
  const parsed = parseInt(page, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function toFirestoreTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  let asDate = value;
  if (!(value instanceof Date)) {
    asDate = new Date(value);
  }
  if (!(asDate instanceof Date) || Number.isNaN(asDate.getTime())) {
    return null;
  }
  return admin.firestore.Timestamp.fromDate(asDate);
}

function applyOrdering(query, visibleSince, sortField, sortOrder) {
  const clauses = [];
  if (visibleSince) {
    clauses.push({ fieldPath: 'createdAt', direction: sortOrder === 'asc' ? 'asc' : 'desc' });
    if (sortField !== 'createdAt') {
      clauses.push({ fieldPath: sortField, direction: sortOrder });
    }
  } else {
    clauses.push({ fieldPath: sortField, direction: sortOrder });
  }
  clauses.push({ fieldPath: DOC_ID_FIELD, direction: 'asc' });
  return clauses.reduce((acc, clause) => acc.orderBy(clause.fieldPath, clause.direction), query);
}

async function advanceQueryByPages(query, pagesToSkip, pageSize) {
  if (pagesToSkip <= 0) {
    return { query, exhausted: false };
  }
  let cursorDoc = null;
  let workingQuery = query;
  for (let i = 0; i < pagesToSkip; i++) {
    const snapshot = await workingQuery.limit(pageSize).get();
    if (snapshot.empty) {
      return { query, exhausted: true };
    }
    cursorDoc = snapshot.docs[snapshot.docs.length - 1];
    workingQuery = query.startAfter(cursorDoc);
  }
  return { query: cursorDoc ? query.startAfter(cursorDoc) : query, exhausted: false };
}

async function listLikes({
  category,
  userName,
  userId,
  sortField,
  sortOrder,
  visibleSince,
  pageSize,
  page,
  paginate = true,
} = {}) {
  let query = getDb().collection('likes');
  if (category) {
    query = query.where('category', '==', category);
  }
  if (userName) {
    query = query.where('userName', '==', userName);
  }
  if (userId) {
    query = query.where('userId', '==', userId);
  }
  const field = normalizeSortField(sortField);
  const direction = normalizeSortOrder(sortOrder);
  const sinceTimestamp = toFirestoreTimestamp(visibleSince);
  if (sinceTimestamp) {
    query = query.where('createdAt', '>=', sinceTimestamp);
  }
  const orderedQuery = applyOrdering(query, sinceTimestamp, field, direction);
  if (!paginate) {
    const snapshot = await orderedQuery.get();
    const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return {
      items,
      totalItems: items.length,
      totalPages: 1,
      currentPage: 1,
      pageSize: items.length,
    };
  }
  const normalizedPageSize = normalizePageSize(pageSize);
  const requestedPage = normalizePageNumber(page);
  const countSnapshot = await query.count().get();
  const totalItems = countSnapshot.data().count || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const safePage = Math.min(requestedPage, totalPages);
  const pagesToSkip = safePage - 1;
  let paginatedQuery = orderedQuery;
  if (pagesToSkip > 0) {
    const advanced = await advanceQueryByPages(orderedQuery, pagesToSkip, normalizedPageSize);
    if (advanced.exhausted) {
      return {
        items: [],
        totalItems,
        totalPages,
        currentPage: safePage,
        pageSize: normalizedPageSize,
      };
    }
    paginatedQuery = advanced.query;
  }
  const pageSnapshot = await paginatedQuery.limit(normalizedPageSize).get();
  const items = pageSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  return {
    items,
    totalItems,
    totalPages,
    currentPage: safePage,
    pageSize: normalizedPageSize,
  };
}

async function addLikeEntry({ userId, userName, date, title, content, url, image, category }) {
  if (!userId) throw new Error('userId is required');
  if (!userName) throw new Error('userName is required');
  const payload = {
    userId,
    userName,
    date,
    title,
    content,
    url,
    image,
    category,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await getDb().collection('likes').add(payload);
}

async function getLikeById(id) {
  const doc = await getDb().collection('likes').doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateLikeEntry(id, data) {
  await getDb()
    .collection('likes')
    .doc(id)
    .update(
      Object.assign({}, data, {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    );
}

async function deleteLikeEntry(id) {
  await getDb().collection('likes').doc(id).delete();
}

async function updateUserNameForUser(userId, userName) {
  if (!userId) throw new Error('userId is required');
  if (!userName) throw new Error('userName is required');
  const snapshot = await getDb().collection('likes').where('userId', '==', userId).get();
  if (snapshot.empty) {
    return 0;
  }
  const batch = getDb().batch();
  snapshot.docs.forEach((doc) => {
    batch.update(doc.ref, {
      userName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return snapshot.size;
}

module.exports = {
  listLikes,
  addLikeEntry,
  getLikeById,
  updateLikeEntry,
  deleteLikeEntry,
  updateUserNameForUser,
};
