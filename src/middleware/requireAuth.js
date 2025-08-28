// src/middleware/requireAuth.js
module.exports = (req, res, next) => {
  // Accept common session/passport shapes
  const userId =
    (req.session && req.session.user && req.session.user._id) ||
    req.session?.userId ||
    req.user?._id;

  if (userId) return next();

  // Avoid redirect loops for auth pages
  const p = req.path || '';
  if (p === '/auth/login' || p.startsWith('/auth/')) return next();

  // Remember where to return after login
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;

  return res.redirect('/auth/login');
};
