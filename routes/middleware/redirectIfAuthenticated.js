function redirectIfAuthenticated(req, res, next) {
  if (req.session?.user?.uid) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = redirectIfAuthenticated;
