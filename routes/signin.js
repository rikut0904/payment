var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');

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
  if (!name || !email || !password) {
    return renderSignin(req, res, { errorMessage: 'メールアドレスとパスワードを入力してください。' });
  }

  try {
    await admin.auth().createUser({ name, email, password });
    return res.redirect('/login');
  } catch (error) {
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
