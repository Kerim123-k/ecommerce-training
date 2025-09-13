// src/controllers/product.controller.js
'use strict';

const path = require('path');
const mongoose = require('mongoose');
const slugify = require('slugify');

const Product  = require('../models/Product');
const Category = require('../models/Category');
const Order    = require('../models/Order');
const Review   = require('../models/Review');

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const toArray = v => (Array.isArray(v) ? v : (v ? [v] : []));

// Read wishlist from session and expose as a Set of productId strings
function getWishIdSet(req) {
  const list = Array.isArray(req.session?.wishlist) ? req.session.wishlist : [];
  // items can be either ObjectIds/strings or { productId, addedAt }
  return new Set(list.map(x => String(x?.productId ?? x)));
}

async function buildRating(productId) {
  const [stats] = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: 'Approved' } },
    { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } },
  ]);
  return {
    count: stats?.count || 0,
    avg: stats ? Number(stats.avg.toFixed(2)) : 0,
  };
}

function relFromPublic(absPath) {
  // ".../public/uploads/products/2025/08/file.jpg" -> "/uploads/products/2025/08/file.jpg"
  if (!absPath) return '';
  const marker = `${path.sep}public${path.sep}`;
  const ix = absPath.indexOf(marker);
  if (ix === -1) return '';
  return absPath.substring(ix + marker.length - 1).replace(/\\/g, '/');
}

function ensureImagesArray(p) {
  if (!Array.isArray(p.images)) p.images = [];
  // keep primary (p.image) as first if present
  if (p.image) {
    p.images = [p.image, ...p.images.filter(u => u !== p.image)];
  }
  return p.images;
}

/* ================================================================== */
/*                              ADMIN                                  */
/* ================================================================== */

// GET /admin/products
exports.adminIndex = async (_req, res, next) => {
  try {
    const products = await Product.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .lean();
    res.render('admin/products/index', { products });
  } catch (e) { next(e); }
};

// GET /admin/products/new
exports.adminNewForm = async (_req, res, next) => {
  try {
    const categories = await Category.find({})
      .select('name title slug')
      .sort({ name: 1, title: 1 })
      .lean();

    res.render('admin/products/new', {
      values: {},
      error: null,
      categories
    });
  } catch (e) { next(e); }
};

// POST /admin/products
exports.adminCreate = async (req, res, next) => {
  try {
    const v = req.body || {};

    // primary image
    let primary = '';
    if (req.file?.path) {
      const rel = relFromPublic(req.file.path);
      if (rel) primary = rel;
    }
    const urlImage = (v.image || '').trim();
    const images = [];
    if (primary) images.push(primary);
    if (urlImage) images.push(urlImage);

    // categories
    const catRaw = v.categoryId || v.category || null;
    const categories = toArray(catRaw)
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map(id => new mongoose.Types.ObjectId(id));

    await Product.create({
      title: v.title || '',
      sku: (v.sku || '').trim(),
      price: Number(v.price || 0),
      status: v.status || 'Draft',
      trackInventory: !!v.trackInventory,
      stockQty: Number(v.stockQty || 0),
      description: v.description || '',
      image: images[0] || '',
      images,
      categories,
      slug: slugify(v.title || '', { lower: true, strict: true })
    });

    res.redirect('/admin/products');
  } catch (e) {
    try {
      const categories = await Category.find({})
        .select('name title slug').sort({ name: 1, title: 1 }).lean();
      res.status(400).render('admin/products/new', {
        values: req.body,
        error: e.message,
        categories
      });
    } catch (loadErr) { next(e); }
  }
};

// GET /admin/products/:id/edit
exports.adminEditForm = async (req, res, next) => {
  try {
    const [p, categories] = await Promise.all([
      Product.findById(req.params.id).lean(),
      Category.find({}).select('name title slug').sort({ name: 1, title: 1 }).lean()
    ]);
    if (!p) return res.status(404).send('Not found');
    res.render('admin/products/edit', { p, categories, error: null });
  } catch (e) { next(e); }
};

// POST /admin/products/:id
exports.adminUpdate = async (req, res, next) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).send('Not found');

    const v = req.body || {};
    p.title          = v.title || p.title;
    p.sku            = (v.sku || p.sku || '').trim();
    p.price          = Number(v.price || p.price || 0);
    p.status         = v.status || p.status || 'Draft';
    p.trackInventory = !!v.trackInventory;
    p.stockQty       = Number(v.stockQty || p.stockQty || 0);
    p.description    = v.description || p.description || '';
    p.slug           = slugify(p.title || '', { lower: true, strict: true });

    // category (single-select → array)
    const catRaw = v.categoryId || v.category || '';
    if (catRaw && mongoose.Types.ObjectId.isValid(catRaw)) {
      p.categories = [ new mongoose.Types.ObjectId(catRaw) ];
    } else {
      p.categories = [];
    }

    // optional new primary image
    if (req.file?.path) {
      const rel = relFromPublic(req.file.path);
      if (rel) {
        p.image = rel;
        p.images = ensureImagesArray(p);
        if (!p.images.includes(rel)) p.images.unshift(rel);
        p.images = [rel, ...p.images.filter(u => u !== rel)];
      }
    }

    await p.save();
    res.redirect('/admin/products');
  } catch (e) {
    const [p, categories] = await Promise.all([
      Product.findById(req.params.id).lean(),
      Category.find({}).select('name title slug').sort({ name: 1, title: 1 }).lean()
    ]);
    res.status(400).render('admin/products/edit', { p, categories, error: e.message });
  }
};

// POST /admin/products/:id/delete  (soft delete)
exports.adminDelete = async (req, res, next) => {
  try {
    await Product.updateOne(
      { _id: req.params.id },
      { $set: { isDeleted: true, status: 'Draft' } }
    );
    res.redirect('/admin/products');
  } catch (e) { next(e); }
};

/* ================================================================== */
/*                           STOREFRONT                                */
/* ================================================================== */

// GET /products
exports.storefront = async (req, res, next) => {
  try {
    const { q = '', cat = '', sort = 'new' } = req.query;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 12;

    const match = { status: 'Active', isDeleted: { $ne: true } };

    if (q) {
      match.$or = [
        { title: new RegExp(q, 'i') },
        { sku:   new RegExp(q, 'i') }
      ];
    }

    let currentCategory = null;
    if (cat && mongoose.Types.ObjectId.isValid(cat)) {
      match.categories = new mongoose.Types.ObjectId(cat);
      currentCategory = await Category.findById(cat).select('name slug').lean();
    }

    let sortSpec = { createdAt: -1 };
    if (sort === 'price_asc')  sortSpec = { price: 1 };
    if (sort === 'price_desc') sortSpec = { price: -1 };

    const [cats, total] = await Promise.all([
      Category.find({ status: 'Active' }).sort({ name: 1 }).lean(),
      Product.countDocuments(match),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));
    const skip  = (pageNum - 1) * limit;

    const products = await Product.find(match)
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean();

    const wishIds = getWishIdSet(req);

    res.render('storefront/index', {
      products, cats, q, cat, sort,
      page: pageNum, pages, total, currentCategory,
      wishIds
    });
  } catch (err) { next(err); }
};

// GET /p/:slugOrId  (slug or id)
exports.showEither = async (req, res, next) => {
  try {
    const key = String(req.params.slugOrId || '').trim();

    let product = await Product.findOne({
      slug: key, status: 'Active', isDeleted: { $ne: true }
    }).populate('categories').lean();

    if (!product && mongoose.isValidObjectId(key)) {
      product = await Product.findOne({
        _id: key, status: 'Active', isDeleted: { $ne: true }
      }).populate('categories').lean();
    }

    if (!product) return res.status(404).send('Product not found');

    const qty      = Number(product.stockQty || 0);
    const inStock  = qty > 0;
    const lowStock = product.trackInventory !== false && inStock && qty <= 5;

    const rating  = await buildRating(product._id);
    const reviews = await Review.find({ productId: product._id, status: 'Approved' })
      .sort({ createdAt: -1 })
      .lean();

    const flash = req.session.flash || null;
    delete req.session.flash;

    const wishIds = getWishIdSet(req);

    res.render('storefront/show', { product, inStock, lowStock, rating, reviews, flash, wishIds });
  } catch (e) { next(e); }
};

exports.show = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      status: 'Active',
      isDeleted: { $ne: true },
    }).populate('categories').lean();

    if (!product) return res.status(404).send('Product not found');

    const qty      = Number(product.stockQty || 0);
    const inStock  = qty > 0;
    const lowStock = product.trackInventory !== false && inStock && qty <= 5;

    const rating  = await buildRating(product._id);
    const reviews = await Review.find({ productId: product._id, status: 'Approved' })
      .sort({ createdAt: -1 })
      .lean();

    const flash = req.session.flash || null;
    delete req.session.flash;

    const wishIds = getWishIdSet(req);

    res.render('storefront/show', { product, inStock, lowStock, rating, reviews, flash, wishIds });
  } catch (e) { next(e); }
};

// GET /products/id/:id
exports.showById = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      status: 'Active',
      isDeleted: { $ne: true }
    }).lean();

    if (!product) return res.status(404).send('Not found');

    const qty = Number(product.stockQty || 0);
    const inStock  = qty > 0;
    const lowStock = product.trackInventory !== false && inStock && qty <= 5;

    const [stats] = await Review.aggregate([
      { $match: { productId: product._id, status: 'Approved' } },
      { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }
    ]);

    const reviews = await Review.find({ productId: product._id, status: 'Approved' })
      .sort({ createdAt: -1 })
      .lean();

    const rating = {
      count: stats?.count || 0,
      avg: stats ? Number(stats.avg.toFixed(2)) : 0
    };

    const flash = req.session.flash || null;
    delete req.session.flash;

    const wishIds = getWishIdSet(req);

    res.render('storefront/show', { product, inStock, lowStock, rating, reviews, flash, wishIds });
  } catch (e) { next(e); }
};

// GET /c/:slug
exports.categoryPage = async (req, res, next) => {
  try {
    const { q = '', sort = 'new' } = req.query;
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 12;

    const currentCategory = await Category.findOne({
      slug: req.params.slug,
      status: 'Active'
    }).lean();
    if (!currentCategory) return res.status(404).send('Category not found');

    const match = {
      status: 'Active',
      isDeleted: { $ne: true },
      categories: currentCategory._id
    };

    if (q) {
      match.$or = [
        { title: new RegExp(q, 'i') },
        { sku:   new RegExp(q, 'i') }
      ];
    }

    let sortSpec = { createdAt: -1 };
    if (sort === 'price_asc')  sortSpec = { price: 1 };
    if (sort === 'price_desc') sortSpec = { price: -1 };
    if (sort === 'top')        sortSpec = { ratingAvg: -1, ratingCount: -1, createdAt: -1 };

    const [cats, total] = await Promise.all([
      Category.find({ status: 'Active' }).sort({ name: 1 }).lean(),
      Product.countDocuments(match),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));
    const skip  = (pageNum - 1) * limit;

    const products = await Product.find(match)
      .sort(sortSpec)
      .skip(skip)
      .limit(limit)
      .lean();

    // simple breadcrumb chain
    const breadcrumbs = [];
    let ptr = currentCategory;
    while (ptr && (ptr.parentId || ptr.parent)) {
      const pid = ptr.parentId || ptr.parent;
      const parent = await Category.findById(pid).lean();
      if (!parent) break;
      breadcrumbs.unshift({ name: parent.name, slug: parent.slug });
      ptr = parent;
    }

    const wishIds = getWishIdSet(req);

    res.render('storefront/index', {
      products,
      cats,
      q,
      cat: String(currentCategory._id),
      sort,
      page: pageNum,
      pages,
      total,
      currentCategory,
      breadcrumbs,
      wishIds
    });
  } catch (err) { next(err); }
};
