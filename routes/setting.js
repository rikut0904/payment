var express = require('express');
var admin = require('firebase-admin');
var router = express.Router();
var { getUserProfile, updateUserProfile, deleteUserProfile } = require('../lib/firestoreUsers');
var { updateUserNameForUser, deleteLikesByUser } = require('../lib/firestoreLikes');
var { fetchWithTimeout, isTimeoutError } = require('../lib/httpClient');

function renderSetting(req, res, { errorMessage = '', successMessage = '', formValues = {}, statusCode = 200 } = {}) {
  // 設定画面を描画する。
  res.status(statusCode).render('setting/index', {
    title: '設定',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    errorMessage,
    successMessage,
    formValues,
  });
}

async function loadUserFormValues(sessionUid, req) {
  // プロフィール/セッションからフォーム値を取得する。
  let profile = null;
  try {
    profile = await getUserProfile(sessionUid);
  } catch (err) {
    console.error('Failed to load user profile', err);
  }
  return {
    name: profile?.name || req.session?.user?.name || '',
    email: req.session?.user?.email || '',
  };
}

// 現在のユーザー情報を表示する。
router.get('/', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  const formValues = await loadUserFormValues(sessionUid, req);
  renderSetting(req, res, { formValues });
});

// ユーザー名/メールアドレスを更新する。
router.post('/', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const formValues = { name, email };
  if (!name) {
    return renderSetting(req, res, {
      errorMessage: 'ユーザー名を入力してください。',
      formValues,
    });
  }
  if (!email) {
    return renderSetting(req, res, {
      errorMessage: 'メールアドレスを入力してください。',
      formValues,
    });
  }
  try {
    const previousName = req.session?.user?.name || '';
    const previousEmail = req.session?.user?.email || '';
    if (admin.apps.length) {
      await admin.auth().updateUser(sessionUid, { email });
    }
    try {
      await updateUserNameForUser(sessionUid, name);
      await updateUserProfile(sessionUid, { name });
    } catch (likeErr) {
      if (previousName) {
        await updateUserNameForUser(sessionUid, previousName);
      }
      if (admin.apps.length && previousEmail && previousEmail !== email) {
        try {
          await admin.auth().updateUser(sessionUid, { email: previousEmail });
        } catch (rollbackErr) {
          console.error('Failed to rollback auth email', rollbackErr);
        }
      }
      throw likeErr;
    }
    req.saveSession({
      user: {
        uid: sessionUid,
        email,
        name,
        loginAt: req.session?.user?.loginAt || Date.now(),
      },
    });
    renderSetting(req, res, {
      successMessage: 'ユーザー情報を更新しました。',
      formValues,
    });
  } catch (err) {
    console.error('Failed to update user profile', err);
    renderSetting(req, res, {
      errorMessage: 'ユーザー情報の更新に失敗しました。',
      formValues,
    });
  }
});

// 現在のパスワード確認後に更新する。
router.post('/password', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  const formValues = await loadUserFormValues(sessionUid, req);
  const currentPassword = (req.body.currentPassword || '').trim();
  const password = (req.body.password || '').trim();
  const passwordConfirm = (req.body.passwordConfirm || '').trim();
  const email = req.session?.user?.email || '';
  let validationError = '';
  if (!currentPassword) {
    validationError = '現在のパスワードを入力してください。';
  } else if (!password) {
    validationError = 'パスワードを入力してください。';
  } else if (password !== passwordConfirm) {
    validationError = 'パスワードが一致しません。';
  } else if (!email) {
    validationError = 'メールアドレスが取得できませんでした。';
  }
  if (validationError) {
    return renderSetting(req, res, { errorMessage: validationError, formValues });
  }
  try {
    if (!admin.apps.length) {
      throw new Error('Firebase Admin SDK is not initialized.');
    }
    if (!process.env.FIREBASE_API_KEY) {
      console.error('FIREBASE_API_KEY is not configured.');
      return renderSetting(req, res, {
        errorMessage: 'サーバーエラーが発生しました。時間をおいて再度お試しください。',
        formValues,
        statusCode: 500,
      });
    }
    const verifyResponse = await fetchWithTimeout(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: currentPassword, returnSecureToken: true }),
      }
    );
    if (!verifyResponse.ok) {
      return renderSetting(req, res, { errorMessage: '現在のパスワードが正しくありません。', formValues });
    }
    await admin.auth().updateUser(sessionUid, { password });
    renderSetting(req, res, { successMessage: 'パスワードを更新しました。', formValues });
  } catch (err) {
    console.error('Failed to update password', err);
    if (isTimeoutError(err)) {
      return renderSetting(req, res, {
        errorMessage: '通信がタイムアウトしました。時間をおいて再度お試しください。',
        formValues,
      });
    }
    const formValues = await loadUserFormValues(sessionUid, req);
    renderSetting(req, res, { errorMessage: 'パスワードの更新に失敗しました。', formValues });
  }
});

// likes/profile/authを順に削除する。
router.post('/delete', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  try {
    const failures = [];
    try {
      await deleteLikesByUser(sessionUid);
    } catch (err) {
      failures.push('likes');
      console.error('Failed to delete likes for user', err);
    }
    try {
      await deleteUserProfile(sessionUid);
    } catch (err) {
      failures.push('profile');
      console.error('Failed to delete user profile', err);
    }
    let authDeleted = false;
    try {
      if (admin.apps.length) {
        await admin.auth().deleteUser(sessionUid);
      }
      authDeleted = true;
    } catch (err) {
      failures.push('auth');
      console.error('Failed to delete auth user', err);
    }
    if (!authDeleted) {
      return renderSetting(req, res, {
        errorMessage: 'アカウントの削除に失敗しました。時間をおいて再度お試しください。',
        statusCode: 500,
      });
    }
    if (failures.length) {
      console.error('Account deletion completed with partial failures:', failures);
    }
    req.clearSession();
    return res.redirect('/login');
  } catch (err) {
    console.error('Failed to delete user', err);
    renderSetting(req, res, { errorMessage: 'アカウントの削除に失敗しました。' });
  }
});

module.exports = router;
