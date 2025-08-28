// src/controllers/coupon.controller.js
const Coupon = require('../models/Coupon');

exports.index = async (_req, res, next) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
    res.render('coupons/index', { coupons });
  } catch (e) { next(e); }
};

exports.newForm = (_req, res) => {
  res.render('coupons/new', { values: {}, error: null });
};

exports.create = async (req, res, next) => {
  try {
    const v = req.body;
    await Coupon.create({
      code: String(v.code || '').trim().toUpperCase(),
      type: v.type,
      value: Number(v.value || 0),
      active: v.active === 'on',
      minSubtotal: Number(v.minSubtotal || 0),
      startsAt: v.startsAt ? new Date(v.startsAt) : null,
      endsAt:   v.endsAt   ? new Date(v.endsAt)   : null,
      maxUses:  v.maxUses ? Number(v.maxUses) : undefined,
      notes: v.notes || ''
    });
    res.redirect('/admin/coupons');
  } catch (e) {
    res.status(400).render('coupons/new', { values: req.body, error: e.message });
  }
};

exports.toggle = async (req, res, next) => {
  try {
    const c = await Coupon.findById(req.params.id);
    if (!c) return res.status(404).send('Not found');
    c.active = !c.active;
    await c.save();
    res.redirect('/admin/coupons');
  } catch (e) { next(e); }
};

exports.destroy = async (req, res, next) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.redirect('/admin/coupons');
  } catch (e) { next(e); }
};
