const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

const SORTABLE_FIELDS = ['createdAt', 'userName', 'title', 'date'];

function normalizeSortField(field) {
  return SORTABLE_FIELDS.includes(field) ? field : 'createdAt';
}

function normalizeSortOrder(order) {
  return order === 'asc' ? 'asc' : 'desc';
}

async function listLikes({ category, userName, sortField, sortOrder } = {}) {
  let query = getDb().collection('likes');
  if (category) {
    query = query.where('category', '==', category);
  }
  if (userName) {
    query = query.where('userName', '==', userName);
  }
  const field = normalizeSortField(sortField);
  const direction = normalizeSortOrder(sortOrder);
  query = query.orderBy(field, direction);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

module.exports = {
  listLikes,
  addLikeEntry,
  getLikeById,
  updateLikeEntry,
  deleteLikeEntry,
};
