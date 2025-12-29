const admin = require('firebase-admin');

function getDb() {
  // Firestoreインスタンスを取得する。
  if (!admin.apps.length) {
    throw new Error('Firebase Admin SDK is not initialized.');
  }
  return admin.firestore();
}

async function createUserProfile(uid, data) {
  // ユーザープロフィールを作成する。
  const db = getDb();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  await db
    .collection('users')
    .doc(uid)
    .set({
      ...data,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
}

async function getUserProfile(uid) {
  // UIDからユーザープロフィールを取得する。
  const db = getDb();
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) {
    return null;
  }
  return doc.data();
}

async function updateUserProfile(uid, data) {
  // ユーザープロフィールを更新する。
  const db = getDb();
  await db
    .collection('users')
    .doc(uid)
    .update({
      ...data,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

async function deleteUserProfile(uid) {
  // ユーザープロフィールを削除する。
  const db = getDb();
  await db.collection('users').doc(uid).delete();
}

module.exports = {
  createUserProfile,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
};
