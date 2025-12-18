const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

async function listLikes() {
  const snapshot = await getDb()
    .collection('likes')
    .orderBy('createdAt', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function addLikeEntry({ userName, date, title, content, url, image }) {
  if (!userName) throw new Error('userName is required');
  const payload = {
    userName,
    date,
    title,
    content,
    url,
    image,
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
