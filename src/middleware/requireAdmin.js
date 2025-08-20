// src/middleware/requireAdmin.js
module.exports = (req, res, next) => {
  const user = req.session?.user;
  if (user?.role === 'Admin') return next();

  if (!user) {
    if (req.method === 'GET') req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  return res.status(403).send('Forbidden');
};
