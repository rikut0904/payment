require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var crypto = require('crypto');

var indexRouter = require('./routes/index');
var dashboardRouter = require('./routes/dashboard');
var settingRouter = require('./routes/setting');
var loginRouter = require('./routes/login');
var signinRouter = require('./routes/signin');
var cardRouter = require('./routes/card');
var likeRouter = require('./routes/like');
var imageProxyRouter = require('./routes/imageProxy');
var { getUserProfile } = require('./lib/firestoreUsers');
var SESSION_COOKIE_NAME = 'payment_session';
var SESSION_SECRET = process.env.SESSION_SECRET;
var SESSION_TIME_MS = parseInt(process.env.SESSION_TIME_MS || '', 10);
if (!Number.isFinite(SESSION_TIME_MS) || SESSION_TIME_MS <= 0) {
  SESSION_TIME_MS = 60 * 1000;
}
var app = express();

app.locals.firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};
app.locals.truncate = (text, length = 30, omission = '...') => {
  if (!text) return '';
  if (text.length <= length) return text;
  const sliceLength = Math.max(0, length - omission.length);
  return text.slice(0, sliceLength) + omission;
};

const admin = require('firebase-admin');
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined,
};
if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  throw new Error('Firebase service account credentials are not fully configured in environment variables.');
}
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// セッション期限を超えた場合は再ログインを促す。
const requireAuth = (req, res, next) => {
  const user = req.session?.user;
  if (!user) return res.redirect('/');
  const loginAt = user.loginAt;
  // 期限切れセッションを破棄してタイムアウトを通知する。
  if (!loginAt || Date.now() - loginAt > SESSION_TIME_MS) {
    req.clearSession();
    res.redirect('/login?timeout=1');
    return;
  }
  next();
};

// テンプレートエンジン設定
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

function encodeSession(data) {
  // セッション情報をエンコードしてHMAC署名する。
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function decodeSession(token) {
  // HMAC署名を検証してセッション情報を復元する。
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expectedSignature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch (err) {
    return null;
  }
}

function setSession(res, data) {
  // 署名済みセッションCookieを設定する。
  const token = encodeSession(data);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TIME_MS,
  });
}

function clearSession(res) {
  // セッションCookieを削除する。
  res.clearCookie(SESSION_COOKIE_NAME);
}

app.use((req, res, next) => {
  // リクエストにセッション情報とヘルパーを付与する。
  const sessionData = decodeSession(req.cookies?.[SESSION_COOKIE_NAME]);
  req.session = sessionData;
  req.saveSession = (data) => {
    setSession(res, data);
    req.session = data;
  };
  req.clearSession = () => {
    clearSession(res);
    req.session = null;
  };
  next();
});

app.use((req, res, next) => {
  // テンプレートにユーザー名を公開する。
  res.locals.userName = req.session?.user?.name || req.session?.user?.email || 'No-Name';
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.post('/session', async (req, res) => {
  // Firebase IDトークンをセッションCookieに変換する。
  if (!admin.apps.length) {
    return res.status(500).json({ error: 'auth not configured' });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(req.body.idToken);
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
    res.sendStatus(204);
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
});

function handleLogout(req, res) {
  // ログアウト時にセッションを破棄する。
  req.clearSession();
  res.sendStatus(204);
}

app.post('/logout', handleLogout);

app.use('/', indexRouter);
app.use('/dashboard', requireAuth, dashboardRouter);
app.use('/card', requireAuth, cardRouter);
app.use('/like', requireAuth, likeRouter);
app.use('/image-proxy', requireAuth, imageProxyRouter);
app.use('/setting', requireAuth, settingRouter);
app.use('/login', loginRouter);
app.use('/signin', signinRouter);

// 404を捕捉してエラーハンドラへ渡す。
app.use(function (req, res, next) {
  next(createError(404));
});

// エラーハンドラ
app.use(function (err, req, res, next) {
  // ローカル変数を設定（開発時のみ詳細）
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.locals.status = err.status || 500;
  res.locals.projectName = res.locals.projectName || 'Payment';
  console.error('Unhandled error:', err);

  // エラーページを描画する。
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
