// src/middleware/requireAuth.js
module.exports = (req, res, next) => {
  // Accept any of these shapes (session or Passport)
  const userId =
    req.session?.user?._id ||
    req.session?.userId ||
    req.user?._id;

  if (userId) return next();

  // Allow auth pages themselves (prevents redirect loops)
  const p = req.path || '';
  if (p === '/auth/login' || p.startsWith('/auth/')) {
    return next();
  }

  // Remember where to return after login
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;

  return res.redirect('/auth/login');
};
