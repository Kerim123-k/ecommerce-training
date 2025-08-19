// src/controllers/address.controller.js
const Customer = require('../models/Customer');

exports.list = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId).lean();
    if (!me) return res.redirect('/auth/login');
    res.render('account/addresses/index', { addresses: me.addresses || [] });
  } catch (e) { next(e); }
};

exports.createForm = (_req, res) => {
  res.render('account/addresses/form', { values: {}, errors: {} });
};

exports.create = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    const { fullName, phone, line1, line2, city, postalCode, country, isDefault } = req.body;
    me.addresses.push({
      fullName, phone, line1, line2, city, postalCode,
      country: country || 'TR', isDefault: !!isDefault,
    });
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.editForm = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId).lean();
    if (!me) return res.redirect('/auth/login');
    const addr = (me.addresses || []).find(a => String(a._id) === req.params.addrId);
    if (!addr) return res.sendStatus(404);
    res.render('account/addresses/form', { values: addr, errors: {} });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    const idx = me.addresses.findIndex(a => String(a._id) === req.params.addrId);
    if (idx === -1) return res.sendStatus(404);

    const { fullName, phone, line1, line2, city, postalCode, country, isDefault } = req.body;
    Object.assign(me.addresses[idx], {
      fullName, phone, line1, line2, city, postalCode, country: country || 'TR',
      isDefault: !!isDefault,
    });

    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.destroy = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    me.addresses = me.addresses.filter(a => String(a._id) !== req.params.addrId);
    await me.save();
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};

exports.setDefault = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.session?.userId || req.user?._id;
    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    await me.setDefaultAddress(req.params.addrId);
    res.redirect('/account/addresses');
  } catch (e) { next(e); }
};
