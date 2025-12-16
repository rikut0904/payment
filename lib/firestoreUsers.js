const admin = require('firebase-admin');

function getDb() {
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

async function createUserProfile(uid, data) {
  const db = getDb();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection('users')
    .doc(uid)
    .set(
      Object.assign({}, data, {
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    );
}

async function getUserProfile(uid) {
  const db = getDb();
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) {
    return null;
  }
  return doc.data();
}

async function updateUserProfile(uid, data) {
  const db = getDb();
  await db
    .collection('users')
    .doc(uid)
    .set(
      Object.assign({}, data, {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      { merge: true }
    );
}

module.exports = {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
};
