var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');
var { getUserProfile } = require('../lib/firestoreUsers');
var { fetchWithTimeout, isTimeoutError } = require('../lib/httpClient');

function mapLoginErrorMessage(code) {
  switch (code) {
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return 'メールアドレスまたはパスワードが正しくありません。';
    case 'USER_DISABLED':
      return 'このアカウントは無効化されています。管理者にお問い合わせください。';
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return '試行回数が多すぎます。しばらくしてから再度お試しください。';
    default:
      return 'ログインに失敗しました。時間をおいて再度お試しください。';
  }
}

function renderLogin(req, res, options = {}) {
  const baseOptions = {
    title: 'ログイン',
    projectName: 'Payment',
    firebaseConfig: req.app.locals.firebaseConfig,
    errorMessage: '',
    infoMessage: '',
  };
  if (req.query.timeout) {
    baseOptions.infoMessage = '一定時間操作がなかったため自動的にログアウトしました。';
  }
  res.render('login', Object.assign(baseOptions, options));
}

router.get('/', function (req, res) {
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  renderLogin(req, res);
});

router.post('/', async function (req, res) {
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  const { email, password } = req.body || {};
  if (!email || !password) {
    return renderLogin(req, res, { errorMessage: 'メールアドレスとパスワードを入力してください。' });
  }
  if (!process.env.FIREBASE_API_KEY) {
    return renderLogin(req, res, { errorMessage: 'Firebase APIキーが設定されていません。' });
  }

  try {
    const response = await fetchWithTimeout(
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
      return renderLogin(req, res, { errorMessage: mapLoginErrorMessage(errorCode) });
    }

    const data = await response.json();
    const decoded = await admin.auth().verifyIdToken(data.idToken);

    let profile = null;
    try {
      profile = await getUserProfile(decoded.uid);
    } catch (profileErr) {
      console.error('ユーザープロフィールの取得に失敗しました:', profileErr);
    }

    req.saveSession({
      user: {
        uid: decoded.uid,
        email: decoded.email,
        name: profile?.name || decoded.name || '',
        loginAt: Date.now(),
      },
    });
    res.redirect('/dashboard');
  } catch (error) {
    console.error('ログイン処理でエラーが発生しました:', error);
    if (isTimeoutError(error)) {
      return renderLogin(req, res, { errorMessage: '通信がタイムアウトしました。時間をおいて再度お試しください。' });
    }
    renderLogin(req, res, { errorMessage: mapLoginErrorMessage(error?.code) });
  }
});

module.exports = router;
