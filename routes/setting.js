var express = require('express');
var admin = require('firebase-admin');
var router = express.Router();
var { getUserProfile, updateUserProfile, deleteUserProfile } = require('../lib/firestoreUsers');
var { updateUserNameForUser, deleteLikesByUser } = require('../lib/firestoreLikes');
var { fetchWithTimeout, isTimeoutError } = require('../lib/httpClient');

function renderSetting(req, res, { errorMessage = '', successMessage = '', formValues = {}, statusCode = 200 } = {}) {
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

/* GET home page. */
router.get('/', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  const formValues = await loadUserFormValues(sessionUid, req);
  renderSetting(req, res, { formValues });
});

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
    if (admin.apps.length) {
      await admin.auth().updateUser(sessionUid, { email });
    }
    const previousName = req.session?.user?.name || '';
    await updateUserProfile(sessionUid, { name });
    try {
      await updateUserNameForUser(sessionUid, name);
    } catch (likeErr) {
      if (previousName) {
        await updateUserNameForUser(sessionUid, previousName);
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

router.post('/password', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
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
    const formValues = await loadUserFormValues(sessionUid, req);
    return renderSetting(req, res, { errorMessage: validationError, formValues });
  }
  try {
    if (!admin.apps.length) {
      throw new Error('Firebase Admin SDK is not initialized.');
    }
    if (!process.env.FIREBASE_API_KEY) {
      console.error('FIREBASE_API_KEY is not configured.');
      const formValues = await loadUserFormValues(sessionUid, req);
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
      const formValues = await loadUserFormValues(sessionUid, req);
      return renderSetting(req, res, { errorMessage: '現在のパスワードが正しくありません。', formValues });
    }
    await admin.auth().updateUser(sessionUid, { password });
    const formValues = await loadUserFormValues(sessionUid, req);
    renderSetting(req, res, { successMessage: 'パスワードを更新しました。', formValues });
  } catch (err) {
    console.error('Failed to update password', err);
    if (isTimeoutError(err)) {
      const formValues = await loadUserFormValues(sessionUid, req);
      return renderSetting(req, res, {
        errorMessage: '通信がタイムアウトしました。時間をおいて再度お試しください。',
        formValues,
      });
    }
    const formValues = await loadUserFormValues(sessionUid, req);
    renderSetting(req, res, { errorMessage: 'パスワードの更新に失敗しました。', formValues });
  }
});

router.post('/delete', async function (req, res) {
  const sessionUid = req.session?.user?.uid;
  if (!sessionUid) {
    return res.redirect('/login');
  }
  try {
    await deleteLikesByUser(sessionUid);
    await deleteUserProfile(sessionUid);
    if (admin.apps.length) {
      await admin.auth().deleteUser(sessionUid);
    }
    req.clearSession();
    return res.redirect('/login');
  } catch (err) {
    console.error('Failed to delete user', err);
    renderSetting(req, res, { errorMessage: 'アカウントの削除に失敗しました。' });
  }
});

module.exports = router;
