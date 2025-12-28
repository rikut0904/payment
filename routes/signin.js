var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');
var { createUserProfile } = require('../lib/firestoreUsers');

function mapSignupErrorMessage(code) {
  switch (code) {
    case 'auth/email-already-exists':
      return 'このメールアドレスは既に登録されています。';
    case 'auth/invalid-password':
      return 'パスワードは6文字以上で入力してください。';
    case 'auth/invalid-email':
      return 'メールアドレスの形式が正しくありません。';
    default:
      return 'アカウント作成に失敗しました。時間をおいて再度お試しください。';
  }
}

function renderSignin(req, res, options = {}) {
  res.render(
    'signin',
    {
      ...options,
      title: 'アカウント作成',
      projectName: 'Payment',
      firebaseConfig: req.app.locals.firebaseConfig,
      successMessage: options.successMessage || '',
      errorMessage: options.errorMessage || '',
    }
  );
}

router.get('/', function (req, res) {
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  renderSignin(req, res);
});

router.post('/', async function (req, res) {
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  const { name, email, password } = req.body || {};
  const trimmedName = (name || '').trim();
  const trimmedEmail = (email || '').trim();
  if (!trimmedName || !trimmedEmail || !password) {
    return renderSignin(req, res, { errorMessage: 'ユーザー名・メールアドレス・パスワードをすべて入力してください。' });
  }

  try {
    const userRecord = await admin.auth().createUser({
      displayName: trimmedName,
      email: trimmedEmail,
      password,
    });

    try {
      await createUserProfile(userRecord.uid, {
        name: trimmedName,
        email: trimmedEmail,
      });
    } catch (profileError) {
      await admin.auth().deleteUser(userRecord.uid);
      throw profileError;
    }

    return res.redirect('/login');
  } catch (error) {
    console.error('アカウント作成に失敗しました:', error);
    return renderSignin(req, res, { errorMessage: mapSignupErrorMessage(error.code) });
  }
});

module.exports = router;
