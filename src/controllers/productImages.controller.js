// src/controllers/productImages.controller.js
'use strict';
const path = require('path');
const Product = require('../models/Product');

function toPublicUrl(absPath) {
  const rel = absPath.split(path.sep + 'public' + path.sep)[1] || '';
  return '/' + rel.replace(/\\/g, '/');
}

// GET admin page
function asArray(v) {
  return Array.isArray(v) ? v : (v ? [v] : []);
}

exports.managePage = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id).lean();
    if (!p) return res.status(404).send('Not found');
    p.images = Array.isArray(p.images) ? p.images : (p.image ? [p.image] : []);
    res.render('admin/products/images', { p });
  } catch (e) { next(e); }
};

// Upload multiple
exports.upload = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).send('Not found');

    const files = Array.isArray(req.files) ? req.files : [];
    const toUrls = f => {
      const i = f.path.indexOf('/public/');
      return i !== -1 ? f.path.substring(i + '/public'.length).replace(/\\/g, '/') : null;
    };
    const urls = files.map(toUrls).filter(Boolean);

    p.images = Array.isArray(p.images) ? p.images : [];
    p.images.push(...urls);
    if (!p.image && urls.length) p.image = urls[0];

    await p.save();
    res.redirect(`/admin/products/${p._id}/images`);
  } catch (e) { next(e); }
};

// Make selected index the cover (move to 0)
exports.setPrimary = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).send('Not found');

    const idx = Math.max(0, parseInt(req.body.idx || req.body.index || 0, 10));
    if (!Array.isArray(p.images) || idx >= p.images.length) {
      return res.redirect(`/admin/products/${p._id}/images`);
    }
    const [img] = p.images.splice(idx, 1);
    p.images.unshift(img);
    p.image = img;

    await p.save();
    res.redirect(`/admin/products/${p._id}/images`);
  } catch (e) { next(e); }
};

// Reorder via CSV like "2,0,1,3"
exports.reorder = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).send('Not found');
    const cur = Array.isArray(p.images) ? p.images.slice() : [];
    if (!cur.length) return res.redirect(`/admin/products/${p._id}/images`);

    const csv = String(req.body.orderCsv || req.body.order || '').trim();
    if (!csv) return res.redirect(`/admin/products/${p._id}/images`);

    // Parse ints, keep only valid unique indices
    const wanted = csv.split(',').map(s => parseInt(s.trim(), 10))
      .filter(n => Number.isInteger(n) && n >= 0 && n < cur.length);

    // Ensure each index appears once; append missing in original order
    const seen = new Set(wanted);
    const full = wanted.concat(cur.map((_, i) => i).filter(i => !seen.has(i)));

    const nextImages = full.map(i => cur[i]);
    p.images = nextImages;
    p.image  = nextImages[0] || '';

    await p.save();
    res.redirect(`/admin/products/${p._id}/images`);
  } catch (e) { next(e); }
};

// Delete single by index or url
exports.destroy = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).send('Not found');

    const byIdx = req.params.idx !== undefined;
    let removed = null;

    if (byIdx) {
      const idx = parseInt(req.params.idx, 10);
      if (Array.isArray(p.images) && idx >= 0 && idx < p.images.length) {
        [removed] = p.images.splice(idx, 1);
      }
    } else if (req.body.url) {
      p.images = (p.images || []).filter(u => {
        if (!removed && u === req.body.url) { removed = u; return false; }
        return true;
      });
    }

    if (removed && p.image === removed) {
      p.image = (p.images && p.images[0]) || '';
    }
    await p.save();

    res.redirect(`/admin/products/${p._id}/images`);
  } catch (e) { next(e); }
};