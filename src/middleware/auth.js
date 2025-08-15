// src/middleware/auth.js
const Customer = require('../models/Customer');

exports.requireLogin = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

exports.requireActiveCustomer = async (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  const me = await Customer.findById(req.session.user._id);
  if (!me || me.status === 'Suspended') return res.status(403).send('Account suspended');
  next();
};
