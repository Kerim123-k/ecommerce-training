// src/middleware/auth.js
const Customer = require('../models/Customer');

function getUserId(req) {
  return (
    req.session?.user?._id ||
    req.session?.userId ||
    req.user?._id ||
    null
  );
}

// Any logged-in user
exports.requireLogin = (req, res, next) => {
  const uid = getUserId(req);
  if (uid) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
};

// Logged-in AND not suspended
exports.requireActiveCustomer = async (req, res, next) => {
  try {
    const uid = getUserId(req);
    if (!uid) {
      if (req.method === 'GET') req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/login');
    }
    const me = await Customer.findById(uid).select('status').lean();
    if (!me) {
      if (req.method === 'GET') req.session.returnTo = req.originalUrl;
      return res.redirect('/auth/login');
    }
    if (me.status === 'Suspended') return res.status(403).send('Account suspended');
    next();
  } catch (e) { next(e); }
};

// Back-compat alias
exports.ensureAuth = (req, res, next) => {
  const uid = getUserId(req);
  if (uid) return next();
  if (req.method === 'GET') req.session.returnTo = req.originalUrl;
  return res.redirect('/auth/login');
};
