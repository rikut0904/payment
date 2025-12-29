function redirectIfAuthenticated(req, res, next) {
  // ログイン済みなら認証ページからリダイレクトする。
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = redirectIfAuthenticated;
