// src/controllers/wishlist.controller.js
const Product = require('../models/Product');

function getList(req) {
  if (!req.session.wishlist) req.session.wishlist = { items: [] };
  return req.session.wishlist.items;
}

function goBack(req, fallback = '/wishlist') {
  return req.get('Referer') || fallback;
}

exports.index = async (req, res, next) => {
  try {
    const ids = getList(req).map(String);
    if (!ids.length) return res.render('wishlist/index', { products: [] });

    const products = await Product.find({
      _id: { $in: ids },
      status: 'Active',
      isDeleted: { $ne: true }
    }).lean();

    // keep session order
    const map = new Map(products.map(p => [String(p._id), p]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean);

    res.render('wishlist/index', { products: ordered });
  } catch (e) { next(e); }
};

exports.add = async (req, res, next) => {
  try {
    const p = await Product.findOne({
      _id: req.params.id,
      status: 'Active',
      isDeleted: { $ne: true }
    }).select('_id slug').lean();

    if (p) {
      const items = getList(req).map(String);
      const id = String(p._id);
      if (!items.includes(id)) items.push(id);
      req.session.wishlist.items = items;
    }

    // prefer going back; fall back to wishlist
    return res.redirect(goBack(req));
  } catch (e) { next(e); }
};

exports.remove = (req, res) => {
  const id = String(req.params.id || '');
  const items = getList(req).map(String).filter(x => x !== id);
  req.session.wishlist.items = items;
  return res.redirect(goBack(req));
};

exports.clear = (req, res) => {
  req.session.wishlist = { items: [] };
  res.redirect('/wishlist');
};

// Toggle add/remove; returns JSON { ok, inWishlist, count }
exports.toggle = (req, res) => {
  if (!req.session.wishlist) req.session.wishlist = { items: [] };
  const items = (req.session.wishlist.items || []).map(String);

  const id = String(req.params.id || '');
  const idx = items.indexOf(id);
  let inWishlist;

  if (idx >= 0) {
    items.splice(idx, 1);
    inWishlist = false;
  } else {
    items.push(id);
    inWishlist = true;
  }

  req.session.wishlist.items = items;
  res.json({ ok: true, inWishlist, count: items.length });
};

exports.toggle = (req, res) => {
  const id = String(req.params.id || '');
  if (!req.session.wishlist) req.session.wishlist = { items: [] };
  const items = (req.session.wishlist.items || []).map(String);

  let inWishlist;
  const i = items.indexOf(id);
  if (i === -1) { items.push(id); inWishlist = true; }
  else { items.splice(i, 1); inWishlist = false; }

  req.session.wishlist.items = items;
  res.json({ ok: true, inWishlist, count: items.length });
};

