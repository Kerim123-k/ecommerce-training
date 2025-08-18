const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');

exports.registerForm = (_req,res) => res.render('auth/register', { errors: [], values: {} });
exports.loginForm    = (_req,res) => res.render('auth/login',    { errors: [], values: {} });

exports.register = async (req,res,next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('auth/register', { errors: v.array(), values: req.body });

    const email = String(req.body.email || '').toLowerCase().trim();
    const exists = await Customer.exists({ email });
    if (exists) return res.status(400).render('auth/register', { errors:[{msg:'Email already in use'}], values: req.body });

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const cust = await Customer.create({
      email,
      passwordHash,
      firstName: req.body.firstName || '',
      lastName:  req.body.lastName  || ''
    });
    req.session.user = { _id: cust._id, email: cust.email, name: (cust.firstName || cust.email) };
    res.redirect(req.session.returnTo || '/products');
  } catch (e) { next(e); }
};

exports.login = async (req,res,next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('auth/login', { errors: v.array(), values: req.body });

    const email = String(req.body.email || '').toLowerCase().trim();
    const cust = await Customer.findOne({ email });
    if (!cust) return res.status(400).render('auth/login', { errors:[{msg:'Invalid email or password'}], values: req.body });
    if (cust.status === 'Suspended') return res.status(403).render('auth/login', { errors:[{msg:'Account suspended'}], values: req.body });

    const ok = await bcrypt.compare(req.body.password, cust.passwordHash);
    if (!ok) return res.status(400).render('auth/login', { errors:[{msg:'Invalid email or password'}], values: req.body });

    req.session.user = { _id: cust._id, email: cust.email, name: cust.firstName || cust.email };
    res.redirect(req.session.returnTo || '/products');
  } catch (e) { next(e); }
};

exports.logout = (req,res) => {
  req.session.user = null;
  res.redirect('/products');
};

// ---------- Forgot / Reset ----------
exports.forgotForm = (_req, res) =>
  res.render('auth/forgot', { ok: false, errors: [], values: {} });

exports.forgot = async (req, res) => {
  console.log('[forgot] POST', req.body);
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) {
      console.log('[forgot] validation errors:', v.array());
      return res.status(400).render('auth/forgot', { ok: false, errors: v.array(), values: req.body });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const cust  = await Customer.findOne({ email });
    console.log('[forgot] lookup:', email, '→', cust ? 'FOUND' : 'NOT FOUND');

    if (cust) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash  = crypto.createHash('sha256').update(token).digest('hex');
      cust.resetTokenHash    = hash;
      cust.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await cust.save();
      const port = process.env.PORT || 3000;
      console.log(`🔐 Password reset link: http://localhost:${port}/auth/reset/${token}`);
    }

    return res.render('auth/forgot', { ok: true, errors: [], values: {} });
  } catch (err) {
    console.error('[forgot] error:', err);
    return res.status(500).render('auth/forgot', {
      ok: false,
      errors: [{ msg: 'Unexpected error. Check server logs.' }],
      values: req.body
    });
  }
};

exports.resetForm = async (req, res) => {
  try {
    const token = req.params.token;
    const hash  = crypto.createHash('sha256').update(token).digest('hex');
    const cust  = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
    if (!cust) return res.status(400).send('Invalid or expired reset link');
    res.render('auth/reset', { token, errors: [] });
  } catch (e) {
    console.error('[resetForm] error:', e);
    res.status(500).send('Unexpected error.');
  }
};

exports.reset = async (req, res) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('auth/reset', { token: req.params.token, errors: v.array() });

    const token = req.params.token;
    const hash  = crypto.createHash('sha256').update(token).digest('hex');
    const cust  = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
    if (!cust) return res.status(400).send('Invalid or expired reset link');

    cust.passwordHash      = await bcrypt.hash(req.body.password, 10);
    cust.resetTokenHash    = undefined;
    cust.resetTokenExpires = undefined;
    await cust.save();

    req.session.user = { _id: cust._id, email: cust.email, name: cust.firstName || cust.email };
    res.redirect('/account/orders');
  } catch (e) {
    console.error('[reset] error:', e);
    res.status(500).send('Unexpected error.');
  }
};
