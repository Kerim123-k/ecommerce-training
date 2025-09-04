// src/controllers/auth.controller.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');

/* ---------------- Email transport (safe, optional) ---------------- */
let transporter = null;
let nodemailerLoaded = false;
try {
  const nodemailer = require('nodemailer');
  nodemailerLoaded = true;

  // Only create a transport if SMTP is configured
  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT || '587') === '465', // true for 465
      auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
} catch (e) {
  console.warn('[auth.controller] nodemailer not installed; will log emails to console.');
}

// Helper to send or log emails without crashing
async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@example.com';

  if (transporter) {
    try {
      await transporter.sendMail({ from, to, subject, html, text: text || html });
      return true;
    } catch (err) {
      console.warn('[auth.controller] sendMail failed, falling back to console:', err?.message || err);
    }
  }
  // Fallback: log the email so flows still work in dev
  console.log('—'.repeat(40));
  console.log('📧 (DEV fallback) Email To:', to);
  console.log('Subject:', subject);
  console.log('HTML:\n', html);
  console.log('—'.repeat(40));
  return false;
}

function buildBaseUrl(req) {
  // Prefer explicit app URL
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  // Derive from request (works in dev)
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http');
  const host  = req.get('host');
  return `${proto}://${host}`;
}

/* ---------------- Views ---------------- */
exports.registerForm = (_req, res) =>
  res.render('auth/register', { errors: [], values: {} });

exports.loginForm = (_req, res) =>
  res.render('auth/login', { errors: [], values: {} });

/* ---------------- Auth: Register ---------------- */
exports.register = async (req, res, next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) {
      return res.status(400).render('auth/register', { errors: v.array(), values: req.body });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const exists = await Customer.exists({ email });
    if (exists) {
      return res.status(400).render('auth/register', { errors: [{ msg: 'Email already in use' }], values: req.body });
    }

    const passwordHash = await bcrypt.hash(req.body.password, 10);
    const cust = await Customer.create({
      email,
      passwordHash,
      firstName: req.body.firstName || '',
      lastName:  req.body.lastName  || ''
    });

    // Create session
    req.session.user = {
      _id: cust._id,
      email: cust.email,
      name: cust.firstName || cust.email,
      role: cust.role || 'User',
    };

    // Optional: welcome email (non-blocking)
    const name = cust.firstName || '';
    const subject = 'Welcome to our store 🎉';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif">
        <h2>Welcome${name ? `, ${name}` : ''}!</h2>
        <p>Your account has been created successfully.</p>
        <p>You can start shopping right away: <a href="${buildBaseUrl(req)}/products">${buildBaseUrl(req)}/products</a></p>
      </div>
    `;
    sendMail({ to: cust.email, subject, html }).catch(() => {});

    // Redirect
    const to = req.session.returnTo || '/products';
    delete req.session.returnTo;
    res.redirect(to);
  } catch (e) { next(e); }
};

/* ---------------- Auth: Login ---------------- */
exports.login = async (req, res, next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) {
      return res.status(400).render('auth/login', { errors: v.array(), values: req.body });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const cust = await Customer.findOne({ email });
    if (!cust) {
      return res.status(400).render('auth/login', { errors: [{ msg: 'Invalid email or password' }], values: req.body });
    }
    if (cust.status === 'Suspended') {
      return res.status(403).render('auth/login', { errors: [{ msg: 'Account suspended' }], values: req.body });
    }

    const ok = await bcrypt.compare(req.body.password, cust.passwordHash);
    if (!ok) {
      return res.status(400).render('auth/login', { errors: [{ msg: 'Invalid email or password' }], values: req.body });
    }

    req.session.user = {
      _id: cust._id,
      email: cust.email,
      name: cust.firstName || cust.email,
      role: cust.role || 'User',
    };

    const to = req.session.returnTo || '/products';
    delete req.session.returnTo;
    res.redirect(to);
  } catch (e) { next(e); }
};

exports.logout = (req, res) => {
  req.session.user = null;
  res.redirect('/products');
};

/* ---------------- Forgot / Reset ---------------- */
exports.forgotForm = (_req, res) =>
  res.render('auth/forgot', { ok: false, errors: [], values: {} });

exports.forgot = async (req, res) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) {
      return res.status(400).render('auth/forgot', { ok: false, errors: v.array(), values: req.body });
    }

    const email = String(req.body.email || '').toLowerCase().trim();
    const cust  = await Customer.findOne({ email });

    // Always show ok=true (do not reveal existence)
    if (cust) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash  = crypto.createHash('sha256').update(token).digest('hex');
      cust.resetTokenHash    = hash;
      cust.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await cust.save();

      const base = buildBaseUrl(req);
      const url  = `${base}/auth/reset/${token}`;

      const subject = 'Reset your password';
      const html = `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif">
          <p>We received a request to reset your password.</p>
          <p><a href="${url}">Click here to reset your password</a></p>
          <p>This link will expire in 60 minutes. If you didn’t request this, you can safely ignore this email.</p>
        </div>
      `;
      await sendMail({ to: email, subject, html });
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
    if (!v.isEmpty()) {
      return res.status(400).render('auth/reset', { token: req.params.token, errors: v.array() });
    }

    const token = req.params.token;
    const hash  = crypto.createHash('sha256').update(token).digest('hex');
    const cust  = await Customer.findOne({ resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } });
    if (!cust) return res.status(400).send('Invalid or expired reset link');

    cust.passwordHash      = await bcrypt.hash(req.body.password, 10);
    cust.resetTokenHash    = undefined;
    cust.resetTokenExpires = undefined;
    await cust.save();

    // Optional: notify password changed (non-blocking)
    const subject = 'Your password was changed';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,sans-serif">
        <p>Your password has been changed successfully.</p>
        <p>If this wasn’t you, please contact support immediately.</p>
      </div>
    `;
    sendMail({ to: cust.email, subject, html }).catch(() => {});

    req.session.user = {
      _id: cust._id,
      email: cust.email,
      name: cust.firstName || cust.email,
      role: cust.role || 'User',
    };

    const to = req.session.returnTo || '/account/orders';
    delete req.session.returnTo;
    res.redirect(to);
  } catch (e) {
    console.error('[reset] error:', e);
    res.status(500).send('Unexpected error.');
  }
};
// ---------- Account delete (confirm + delete) ----------
exports.deleteAccountForm = (req, res) => {
  if (!req.session?.user?._id) return res.redirect('/auth/login');
  res.render('account/delete', { errors: [] });
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const Customer = require('../models/Customer');
    const Order    = require('../models/Order');

    // 1) Remove the user account
    await Customer.deleteOne({ _id: uid });

    // 2) Anonymize past orders (keep ledger, drop PII)
    await Order.updateMany(
      { customerId: uid },
      {
        $set: {
          customerId: null,
          customerEmail: '[deleted]',
        }
      }
    );

    // 3) Log out
    req.session.user = null;
    res.render('auth/login', {
      errors: [{ msg: 'Your account was deleted. You can still view the store as a guest.' }],
      values: {}
    });
  } catch (e) { next(e); }
};
