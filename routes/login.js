var express = require('express');
var router = express.Router();
var admin = require('firebase-admin');
var { getUserProfile } = require('../lib/firestoreUsers');
var { fetchWithTimeout, isTimeoutError } = require('../lib/httpClient');
var redirectIfAuthenticated = require('./middleware/redirectIfAuthenticated');

function mapLoginErrorMessage(code) {
  // Firebase Authエラーコードを表示文言に変換する。
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
  // ログイン画面を描画する。
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
  const statusCode = options.statusCode || 200;
  res.status(statusCode).render('login', Object.assign(baseOptions, options));
}

// ログインフォームを表示する。
router.get('/', redirectIfAuthenticated, function (req, res) {
  renderLogin(req, res);
});

// Firebase Authで認証しセッションを作成する。
router.post('/', redirectIfAuthenticated, async function (req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return renderLogin(req, res, { errorMessage: 'メールアドレスとパスワードを入力してください。' });
  }
  if (!process.env.FIREBASE_API_KEY) {
    console.error('FIREBASE_API_KEY is not configured.');
    return renderLogin(req, res, {
      errorMessage: 'サーバーエラーが発生しました。時間をおいて再度お試しください。',
      statusCode: 500,
    });
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
