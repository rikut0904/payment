var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');
var { createUserProfile } = require('../lib/firestoreUsers');

function renderSignin(req, res, options = {}) {
  res.render(
    'signin',
    Object.assign(
      {
        title: 'アカウント作成',
        projectName: 'Payment',
        firebaseConfig: req.app.locals.firebaseConfig,
        successMessage: options.successMessage || '',
        errorMessage: options.errorMessage || '',
      },
      options
    )
  );
}

router.get('/', function (req, res) {
  renderSignin(req, res);
});

router.post('/', async function (req, res) {
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
    let message = 'アカウント作成に失敗しました。';
    if (error.code === 'auth/email-already-exists') {
      message = 'このメールアドレスは既に登録されています。';
    } else if (error.code === 'auth/invalid-password') {
      message = 'パスワードは6文字以上で入力してください。';
    }
    return renderSignin(req, res, { errorMessage: message });
  }
});

module.exports = router;
