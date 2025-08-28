// Guards admin-only pages.
// If not logged in, redirect to login and remember returnTo.
// If logged in but not Admin, return 403.

module.exports = (req, res, next) => {
  const user = req.session?.user || req.user || null;

  if (!user?._id) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  if ((user.role || 'User') !== 'Admin') {
    return res.status(403).send('Forbidden');
  }

  next();
};
