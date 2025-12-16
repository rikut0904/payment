var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');

function renderLogin(req, res, options = {}) {
  res.render(
    'login',
    Object.assign(
      {
        title: 'ログイン',
        projectName: 'Payment',
        firebaseConfig: req.app.locals.firebaseConfig,
        errorMessage: options.errorMessage || '',
      },
      options
    )
  );
}

router.get('/', function (req, res) {
  renderLogin(req, res);
});

router.post('/', async function (req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return renderLogin(req, res, { errorMessage: 'メールアドレスとパスワードを入力してください。' });
  }
  if (!process.env.FIREBASE_API_KEY) {
    return renderLogin(req, res, { errorMessage: 'Firebase APIキーが設定されていません。' });
  }

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorCode = errorData?.error?.message;
      let message = 'メールアドレスまたはパスワードが正しくありません。';
      if (errorCode === 'TOO_MANY_ATTEMPTS_TRY_LATER') {
        message = '試行回数が多すぎます。しばらくしてから再度お試しください。';
      }
      return renderLogin(req, res, { errorMessage: message });
    }

    const data = await response.json();
    const decoded = await admin.auth().verifyIdToken(data.idToken);
    req.session.user = { uid: decoded.uid, email: decoded.email };
    res.redirect('/dashboard');
  } catch (error) {
    renderLogin(req, res, { errorMessage: 'ログイン処理でエラーが発生しました。' });
  }
});

module.exports = router;
