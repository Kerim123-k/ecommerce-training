// src/controllers/account.controller.js
const crypto   = require('crypto');
const Customer = require('../models/Customer');
const Order    = require('../models/Order');

/* utils */
function uid(req) {
  return req.session?.user?._id || req.user?._id || null;
}

/* ========================= Hub ========================= */
async function dashboard(req, res, next) {
  try {
    const userId = uid(req);
    const ordersCount = await Order.countDocuments({ customerId: userId });
    const me = await Customer.findById(userId).lean();
    res.render('account/index', {
      ordersCount,
      addresses: me?.addresses || [],
    });
  } catch (e) { next(e); }
}

/* ========================= Orders ========================= */
async function orders(req, res, next) {
  try {
    const userId = uid(req);
    const list = await Order.find({ customerId: userId })
      .sort({ createdAt: -1 })
      .lean();
    res.render('account/orders/index', { orders: list });
  } catch (e) { next(e); }
}

/* ========================= Addresses ========================= */
async function addressList(req, res, next) {
  try {
    const me = await Customer.findById(uid(req)).lean();
    res.render('account/index', { addresses: me?.addresses || [] });
  } catch (e) { next(e); }
}

function addressNewForm(_req, res) {
  res.render('account/new', { values: {}, errors: [] });
}

async function addressCreate(req, res, next) {
  try {
    const me = await Customer.findById(uid(req));
    if (!me) return res.redirect('/auth/login');

    const a = {
      label:      req.body.label || '',
      firstName:  req.body.firstName || '',
      lastName:   req.body.lastName || '',
      fullName:   req.body.fullName || '',
      line1:      req.body.line1 || '',
      line2:      req.body.line2 || '',
      city:       req.body.city || '',
      province:   req.body.province || '',
      postalCode: req.body.postalCode || '',
      country:    req.body.country || 'TR',
      phone:      req.body.phone || '',
      isDefault:  !!req.body.isDefault,
    };

    me.addresses = me.addresses || [];
    me.addresses.push(a);

    if (a.isDefault) {
      me.addresses = me.addresses.map((x, i) =>
        i === me.addresses.length - 1 ? { ...x, isDefault: true } : { ...x, isDefault: false }
      );
    }
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
}

async function addressEditForm(req, res, next) {
  try {
    const me = await Customer.findById(uid(req)).lean();
    const idx = parseInt(req.params.idx, 10) || 0;
    const addr = (me?.addresses || [])[idx];
    if (!addr) return res.status(404).send('Address not found');
    res.render('account/edit', { idx, values: addr, errors: [] });
  } catch (e) { next(e); }
}

async function addressUpdate(req, res, next) {
  try {
    const me = await Customer.findById(uid(req));
    const idx = parseInt(req.params.idx, 10) || 0;
    if (!me || !me.addresses || !me.addresses[idx]) {
      return res.status(404).send('Address not found');
    }

    const a = me.addresses[idx];
    a.label      = req.body.label || a.label || '';
    a.firstName  = req.body.firstName || a.firstName || '';
    a.lastName   = req.body.lastName || a.lastName || '';
    a.fullName   = req.body.fullName || a.fullName || '';
    a.line1      = req.body.line1 || a.line1 || '';
    a.line2      = req.body.line2 || a.line2 || '';
    a.city       = req.body.city || a.city || '';
    a.province   = req.body.province || a.province || '';
    a.postalCode = req.body.postalCode || a.postalCode || '';
    a.country    = req.body.country || a.country || 'TR';
    a.phone      = req.body.phone || a.phone || '';
    a.isDefault  = !!req.body.isDefault;

    if (a.isDefault) {
      me.addresses = me.addresses.map((x, i) =>
        i === idx ? { ...x, isDefault: true } : { ...x, isDefault: false }
      );
    }

    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
}

async function addressDelete(req, res, next) {
  try {
    const me = await Customer.findById(uid(req));
    const idx = parseInt(req.params.idx, 10) || 0;
    if (!me || !me.addresses || !me.addresses[idx]) {
      return res.status(404).send('Address not found');
    }
    me.addresses.splice(idx, 1);
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
}

async function addressMakeDefault(req, res, next) {
  try {
    const me = await Customer.findById(uid(req));
    const idx = parseInt(req.params.idx, 10) || 0;
    if (!me || !me.addresses || !me.addresses[idx]) {
      return res.status(404).send('Address not found');
    }
    me.addresses = me.addresses.map((x, i) => ({ ...x, isDefault: i === idx }));
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
}

/* ========================= Delete account ========================= */
function deleteForm(_req, res) {
  res.render('account/delete', { errors: [] });
}

async function deleteAccount(req, res, next) {
  try {
    const userId = uid(req);
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    // Soft-delete: keep orders; anonymize + disable login.
    me.status = 'Suspended'; // enum-safe
    me.addresses = [];
    me.passwordHash = crypto.randomBytes(32).toString('hex'); // keep required field non-empty
    me.resetTokenHash = undefined;
    me.resetTokenExpires = undefined;
    me.email = `deleted+${me._id}@example.invalid`;

    await me.save();

    req.session.user = null;
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };

    res.redirect('/products');
  } catch (e) { next(e); }
}

/* explicit, stable exports */
module.exports = {
  dashboard,
  orders,
  addressList,
  addressNewForm,
  addressCreate,
  addressEditForm,
  addressUpdate,
  addressDelete,
  addressMakeDefault,
  deleteForm,
  deleteAccount,
};
