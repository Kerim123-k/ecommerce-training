// src/controllers/wishlist.controller.js
'use strict';

const mongoose = require('mongoose');
const Product = require('../models/Product');

function getList(req) {
  if (!Array.isArray(req.session.wishlist)) req.session.wishlist = [];
  return req.session.wishlist;
}

function redirectBack(req, res, fallback = '/wishlist') {
  res.redirect(req.get('Referer') || fallback);
}

// GET /wishlist
async function index(req, res, next) {
  try {
    const ids = getList(req)
      .map(String)
      .filter(id => mongoose.Types.ObjectId.isValid(id));

    if (!ids.length) {
      return res.render('wishlist/index', { products: [] });
    }

    const products = await Product.find({
      _id: { $in: ids },
      isDeleted: { $ne: true },
    }).lean();

    // Keep original order
    const map = new Map(products.map(p => [String(p._id), p]));
    const ordered = ids.map(id => map.get(id)).filter(Boolean);

    res.render('wishlist/index', { products: ordered });
  } catch (e) { next(e); }
}

// POST /wishlist/add/:id
function add(req, res) {
  const id = String(req.params.id || '');
  const list = getList(req);
  if (mongoose.Types.ObjectId.isValid(id) && !list.includes(id)) {
    list.push(id);                  // de-duped add
  }
  redirectBack(req, res);
}

// POST /wishlist/remove/:id
function remove(req, res) {
  const id = String(req.params.id || '');
  const list = getList(req);
  req.session.wishlist = list.filter(x => String(x) !== id);
  redirectBack(req, res);
}

// POST /wishlist/clear
function clear(req, res) {
  req.session.wishlist = [];
  redirectBack(req, res);
}

// POST /wishlist/toggle/:id
// src/controllers/wishlist.controller.js
function toggle(req, res) {
  const id = String(req.params.id || '').trim();
  if (!id) return res.redirect(req.get('referer') || '/products');

  let list = Array.isArray(req.session.wishlist) ? req.session.wishlist.map(String) : [];
  const ix = list.indexOf(id);

  let wished;
  if (ix === -1) { list.push(id); wished = true; }
  else { list.splice(ix, 1); wished = false; }

  req.session.wishlist = list;
  req.session.save(() => {
    // If you ever want AJAX, you already have the payload:
    if (req.xhr || (req.headers.accept || '').includes('application/json')) {
      return res.json({ ok: true, wished, count: list.length });
    }
    res.redirect(req.get('referer') || '/products');
  });
};


module.exports = { index, add, remove, clear,toggle};
