#!/usr/bin/env node

require('dotenv').config();
const admin = require('firebase-admin');
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error('Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in environment.');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

async function deleteAllUsers() {
  // Firebase Authのユーザーを一括削除する。
  let nextPageToken;
  let deletedCount = 0;

  do {
    const listResult = await admin.auth().listUsers(1000, nextPageToken);
    if (!listResult.users.length) {
      break;
    }

    const uids = listResult.users.map((user) => user.uid);
    const deleteResult = await admin.auth().deleteUsers(uids);
    deletedCount += deleteResult.successCount;

    if (deleteResult.failureCount) {
      console.warn(
        `Warning: ${deleteResult.failureCount} users could not be deleted. Inspect errors for details.`,
        deleteResult.errors
      );
    }

    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log(`Deleted ${deletedCount} user(s) from Firebase Auth.`);
}

deleteAllUsers()
  .then(() => {
    console.log('All users processed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Failed to delete users:', err);
    process.exit(1);
  });
