require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');

var indexRouter = require('./routes/index');
var dashboardRouter = require('./routes/dashboard');
var settingRouter = require('./routes/setting');
var loginRouter = require('./routes/login');
var signinRouter = require('./routes/signin');
var { getUserProfile } = require('./lib/firestoreUsers');
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

const admin = require('firebase-admin');
var serviceAccountJson = require('./serviceAcountkey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccountJson)
});

const requireAuth = (req, res, next) => {
  if (!req.session?.user) return res.redirect('/');
  next();
};

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

app.post('/session', async (req, res) => {
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
    req.session.user = {
      uid: decoded.uid,
      email: decoded.email,
      name: profile?.name || decoded.name || '',
    };
    res.sendStatus(204);
  } catch (err) {
    res.status(401).json({ error: 'invalid token' });
  }
});

function handleLogout(req, res) {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.sendStatus(204);
  });
}

app.post('/logout', handleLogout);

app.use('/', indexRouter);
app.use('/dashboard', requireAuth, dashboardRouter);
app.use('/setting', requireAuth, settingRouter);
app.use('/login', loginRouter);
app.use('/signin', signinRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
