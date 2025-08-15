const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');

exports.registerForm = (_req,res) => res.render('auth/register', { errors: [], values: {} });
exports.loginForm = (_req,res) => res.render('auth/login', { errors: [], values: {} });

exports.register = async (req,res,next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('auth/register', { errors: v.array(), values: req.body });

    const exists = await Customer.exists({ email: req.body.email.toLowerCase() });
    if (exists) return res.status(400).render('auth/register', { errors:[{msg:'Email already in use'}], values: req.body });

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const cust = await Customer.create({
      email: req.body.email.toLowerCase(),
      passwordHash,
      firstName: req.body.firstName || '',
      lastName: req.body.lastName || ''
    });
    req.session.user = { _id: cust._id, email: cust.email, name: (cust.firstName || cust.email) };
    res.redirect(req.session.returnTo || '/products');
  } catch (e) { next(e); }
};

exports.login = async (req,res,next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('auth/login', { errors: v.array(), values: req.body });

    const cust = await Customer.findOne({ email: req.body.email.toLowerCase() });
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

exports.forgotForm = (_req,res) => res.render('auth/forgot', { ok:false, errors:[], values:{} });
exports.resetForm = async (req,res) => {
  const hash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const cust = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
  if (!cust) return res.status(400).send('Invalid or expired reset link');
  res.render('auth/reset', { token: req.params.token, errors:[] });
};

// handle submits
exports.forgot = async (req,res) => {
  const v = validationResult(req);
  if (!v.isEmpty()) return res.status(400).render('auth/forgot', { ok:false, errors:v.array(), values:req.body });
  const email = req.body.email.toLowerCase();
  const cust = await Customer.findOne({ email });
  // Always act as if it's fine (avoid user enumeration)
  if (cust) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    cust.resetTokenHash = hash;
    cust.resetTokenExpires = new Date(Date.now() + 60*60*1000); // 1h
    await cust.save();
    // "Send" email — for training we log it
    console.log(`🔐 Password reset link: http://localhost:${process.env.PORT||3000}/auth/reset/${token}`);
  }
  res.render('auth/forgot', { ok:true, errors:[], values:{} });
};

exports.reset = async (req,res) => {
  const v = validationResult(req);
  if (!v.isEmpty()) return res.status(400).render('auth/reset', { token:req.params.token, errors:v.array() });

  const hash = crypto.createHash('sha256').update(req.params.token).digest('hex');
  const cust = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
  if (!cust) return res.status(400).send('Invalid or expired reset link');

  cust.passwordHash = await bcrypt.hash(req.body.password, 10);
  cust.resetTokenHash = undefined;
  cust.resetTokenExpires = undefined;
  await cust.save();

  // log them in
  req.session.user = { _id: cust._id, email: cust.email, name: cust.firstName || cust.email };
  res.redirect('/account/orders');
};



exports.forgotForm = (_req, res) => res.render('auth/forgot', { ok: false, errors: [], values: {} });

exports.resetForm = async (req, res) => {
  const token = req.params.token;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const cust = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
  if (!cust) return res.status(400).send('Invalid or expired reset link');
  res.render('auth/reset', { token, errors: [] });
};

// Submit handlers
exports.forgot = async (req, res) => {
  console.log('[forgot] hit with body:', req.body);

  const v = validationResult(req);
  if (!v.isEmpty()) {
    console.log('[forgot] validation errors:', v.array());
    return res.status(400).render('auth/forgot', { ok: false, errors: v.array(), values: req.body });
  }

  const email = String(req.body.email || '').toLowerCase();
  const cust = await Customer.findOne({ email });
  console.log('[forgot] lookup:', email, '→', cust ? 'FOUND' : 'NOT FOUND');

  if (!cust) {
    // still render success to avoid user enumeration
    return res.render('auth/forgot', { ok: true, errors: [], values: {} });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  cust.resetTokenHash = hash;
  cust.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
  await cust.save();

  const port = process.env.PORT || 3000;
  console.log(`🔐 Password reset link: http://localhost:${port}/auth/reset/${token}`);

  return res.render('auth/forgot', { ok: true, errors: [], values: {} });
};

exports.reset = async (req, res) => {
  const v = validationResult(req);
  if (!v.isEmpty()) {
    return res.status(400).render('auth/reset', { token: req.params.token, errors: v.array() });
  }

  const token = req.params.token;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const cust = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
  if (!cust) return res.status(400).send('Invalid or expired reset link');

  cust.passwordHash = await bcrypt.hash(req.body.password, 10);
  cust.resetTokenHash = undefined;
  cust.resetTokenExpires = undefined;
  await cust.save();

  // Log them in after reset
  req.session.user = { _id: cust._id, email: cust.email, name: cust.firstName || cust.email };
  res.redirect('/account/orders');
};