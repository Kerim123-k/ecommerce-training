// src/controllers/address.controller.js
const Customer = require('../models/Customer');

// List
exports.list = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id).lean();
    res.render('account/addresses/index', { addresses: me?.addresses || [] });
  } catch (e) { next(e); }
};

// New form
exports.createForm = (_req, res) => {
  res.render('account/addresses/new', { values: {}, errors: [] });
};

// Create
exports.create = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id);

    // minimal validation
    const errors = [];
    if (!req.body.line1)   errors.push({ msg: 'Line 1 is required' });
    if (!req.body.city)    errors.push({ msg: 'City is required' });
    if (!req.body.country) errors.push({ msg: 'Country is required' });
    if (errors.length) {
      return res.status(400).render('account/addresses/new', { values: req.body, errors });
    }

    const fullName =
      (req.body.fullName || '').trim() ||
      [req.body.firstName, req.body.lastName].filter(Boolean).join(' ') ||
      (req.body.label || '').trim();

    const addr = {
      fullName,
      line1: req.body.line1,
      line2: req.body.line2 || '',
      city: req.body.city,
      province: req.body.province || '',
      postalCode: req.body.postalCode || '',
      country: req.body.country || 'TR',
      phone: req.body.phone || '',
      isDefault: false,
    };

    // first address is default OR checkbox checked
    const wantDefault = req.body.isDefault === 'on' || !(me.addresses?.length);
    if (wantDefault) {
      me.addresses.forEach(a => { a.isDefault = false; });
      addr.isDefault = true;
    }

    me.addresses.push(addr);
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

// Edit form
exports.editForm = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id);
    const addr = me.addresses.id(req.params.addrId);
    if (!addr) return res.status(404).send('Address not found');

    res.render('account/addresses/new', { values: addr.toObject(), errors: [] });
  } catch (e) { next(e); }
};

// Update
exports.update = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id);
    const addr = me.addresses.id(req.params.addrId);
    if (!addr) return res.status(404).send('Address not found');

    // minimal validation
    const errors = [];
    if (!req.body.line1)   errors.push({ msg: 'Line 1 is required' });
    if (!req.body.city)    errors.push({ msg: 'City is required' });
    if (!req.body.country) errors.push({ msg: 'Country is required' });
    if (errors.length) {
      return res.status(400).render('account/addresses/new', { values: { ...req.body, _id: addr._id }, errors });
    }

    const fullName =
      (req.body.fullName || '').trim() ||
      [req.body.firstName, req.body.lastName].filter(Boolean).join(' ') ||
      (req.body.label || '').trim();

    Object.assign(addr, {
      fullName,
      line1: req.body.line1,
      line2: req.body.line2 || '',
      city: req.body.city,
      province: req.body.province || '',
      postalCode: req.body.postalCode || '',
      country: req.body.country || 'TR',
      phone: req.body.phone || '',
    });

    const wantDefault = req.body.isDefault === 'on';
    if (wantDefault) {
      me.addresses.forEach(a => { a.isDefault = false; });
      addr.isDefault = true;
    }

    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

// Delete
exports.destroy = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id);
    const addr = me.addresses.id(req.params.addrId);
    if (!addr) return res.status(404).send('Address not found');

    const wasDefault = addr.isDefault;
    addr.deleteOne();
    if (wasDefault && me.addresses.length) me.addresses[0].isDefault = true;

    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

// Make default
exports.setDefault = async (req, res, next) => {
  try {
    const me = await Customer.findById(req.session.user._id);
    const addr = me.addresses.id(req.params.addrId);
    if (!addr) return res.status(404).send('Address not found');

    me.addresses.forEach(a => { a.isDefault = false; });
    addr.isDefault = true;

    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};
