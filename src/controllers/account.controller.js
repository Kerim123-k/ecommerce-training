const { validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

function idxSafe(arr, i) { return (i >= 0 && i < arr.length) ? i : -1; }

exports.dashboard = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id).lean();
    res.render('account/index', { me });
  } catch (e) { next(e); }
};

exports.orderHistory = async (req, res, next) => {
  try {
    const orders = await Order.find({ customerId: req.session.user._id }).sort({ createdAt: -1 }).lean();
    res.render('account/orders', { orders });
  } catch (e) { next(e); }
};

// Addresses
exports.addressList = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id).lean();
    res.render('account/addresses/index', { me, errors: [] });
  } catch (e) { next(e); }
};

exports.addressNewForm = (_req, res) =>
  res.render('account/addresses/new', { errors: [], values: {} });

exports.addressCreate = async (req, res, next) => {
  try {
    const v = validationResult(req);
    if (!v.isEmpty()) return res.status(400).render('account/addresses/new', { errors: v.array(), values: req.body });

    const me = await Customer.findById(req.session.user._id);
    const addr = {
      label: req.body.label || '',
      firstName: req.body.firstName || '',
      lastName: req.body.lastName || '',
      line1: req.body.line1,
      line2: req.body.line2 || '',
      city: req.body.city,
      province: req.body.province || '',
      postalCode: req.body.postalCode || '',
      country: req.body.country || 'TR',
      phone: req.body.phone || '',
      isDefault: !me.addresses?.length // first one becomes default
    };
    me.addresses.push(addr);
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.addressEditForm = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id).lean();
    const i = Number(req.params.idx);
    if (idxSafe(me.addresses, i) === -1) return res.status(404).send('Address not found');
    res.render('account/addresses/edit', { addr: me.addresses[i], idx: i, errors: [], values: {} });
  } catch (e) { next(e); }
};

exports.addressUpdate = async (req, res, next) => {
  try {
    const v = validationResult(req);
    const i = Number(req.params.idx);
    const me = await Customer.findById(req.session.user._id);
    if (idxSafe(me.addresses, i) === -1) return res.status(404).send('Address not found');

    if (!v.isEmpty()) {
      return res.status(400).render('account/addresses/edit', { addr: me.addresses[i].toObject?.() || me.addresses[i], idx: i, errors: v.array(), values: req.body });
    }

    Object.assign(me.addresses[i], {
      label: req.body.label || '',
      firstName: req.body.firstName || '',
      lastName: req.body.lastName || '',
      line1: req.body.line1,
      line2: req.body.line2 || '',
      city: req.body.city,
      province: req.body.province || '',
      postalCode: req.body.postalCode || '',
      country: req.body.country || 'TR',
      phone: req.body.phone || ''
    });
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.addressDelete = async (req, res, next) => {
  try {
    const i = Number(req.params.idx);
    const me = await Customer.findById(req.session.user._id);
    if (idxSafe(me.addresses, i) === -1) return res.status(404).send('Address not found');

    const wasDefault = me.addresses[i].isDefault;
    me.addresses.splice(i, 1);
    if (wasDefault && me.addresses.length) me.addresses[0].isDefault = true;
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.addressMakeDefault = async (req, res, next) => {
  try {
    const i = Number(req.params.idx);
    const me = await Customer.findById(req.session.user._id);
    if (idxSafe(me.addresses, i) === -1) return res.status(404).send('Address not found');

    me.addresses.forEach((a, idx) => a.isDefault = (idx === i));
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.dashboard = async (req, res) => {
  // keep it simple for now
  res.redirect('/account/orders');
};

exports.orders = async (req, res, next) => {
  try {
    const orders = await Order.find({ customerId: req.session.user._id })
      .sort({ createdAt: -1 });
    res.render('account/orders', { orders });
  } catch (e) { next(e); }
};
