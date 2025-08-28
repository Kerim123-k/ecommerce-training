// src/controllers/product.controller.js
const path = require('path');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const slugify = require('slugify');

const Product  = require('../models/Product');
const Category = require('../models/Category');
const Order    = require('../models/Order');
const Review   = require('../models/Review');

const toArray = v => (Array.isArray(v) ? v : (v ? [v] : []));

/* ----------------------------- ADMIN: LIST ----------------------------- */
exports.list = async (_req, res) => {
  const products = await Product.find({ isDeleted: { $ne: true } })
    .populate('categories')
    .sort({ createdAt: -1 });

  res.render('products/index', { products });
};

/* ------------------------ ADMIN: CREATE (FORM) ------------------------- */
exports.createForm = async (_req, res) => {
  const cats = await Category.find({ status: 'Active' }).sort({ name: 1 });
  res.render('products/new', { cats, errors: [], values: {} });
};

/* ---------------------- helpers: image collection ---------------------- */
function relFromReqFile(req) {
  if (!req.file) return null;
  if (req.file.relUrl) return req.file.relUrl; // set by route middleware
  if (req.file.path) {
    const parts = req.file.path.split(path.sep + 'public' + path.sep);
    if (parts[1]) return '/' + parts[1].replace(/\\/g, '/');
  }
  return null;
}

function collectImages(req) {
  const out = [];
  const url = (req.body.image || '').trim(); // optional URL field
  if (url) out.push(url);

  const rel = relFromReqFile(req);
  if (rel) out.push(rel);

  return [...new Set(out.filter(Boolean))];
}

/* ------------------------ ADMIN: CREATE (POST) ------------------------- */
exports.create = async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderNewWithErrors(req, res, result.array().map(e => e.msg));
    }

    const exists = await Product.exists({ sku: req.body.sku, isDeleted: { $ne: true } });
    if (exists) return renderNewWithErrors(req, res, ['A product with this SKU already exists.']);

    const {
      title, sku, price, stockQty,
      status = 'Draft', categories = [],
    } = req.body;

    const images = collectImages(req);

    if (status === 'Active') {
      const errs = await checkActivationRules({ categories, images });
      if (errs.length) return renderNewWithErrors(req, res, errs);
    }

    await Product.create({
      title,
      sku,
      price: Number(price),
      stockQty: Number(stockQty),
      status,
      categories: toArray(categories),
      images,
      image: images[0] || '',
      slug: slugify(title, { lower: true, strict: true })
    });

    res.redirect('/admin/products');
  } catch (e) {
    if (e.code === 11000 && e.keyPattern && e.keyPattern.sku) {
      return renderNewWithErrors(req, res, ['A product with this SKU already exists.']);
    }
    next(e);
  }
};

/* -------------------------- ADMIN: EDIT (FORM) ------------------------- */
exports.editForm = async (req, res, next) => {
  try {
    const [product, cats] = await Promise.all([
      Product.findById(req.params.id),
      Category.find({ status: 'Active' }).sort({ name: 1 })
    ]);
    if (!product) return res.status(404).send('Product not found');

    res.render('products/edit', { product, cats, errors: [], values: {} });
  } catch (e) { next(e); }
};

/* -------------------------- ADMIN: UPDATE (POST) ----------------------- */
exports.update = async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderEditWithErrors(req, res, req.params.id, result.array().map(e => e.msg));
    }

    // prevent SKU duplicates (excluding this product)
    const dup = await Product.exists({
      sku: req.body.sku,
      _id: { $ne: req.params.id },
      isDeleted: { $ne: true }
    });
    if (dup) {
      return renderEditWithErrors(req, res, req.params.id, ['A product with this SKU already exists.']);
    }

    const { title, sku, price, stockQty, status = 'Draft', categories = [] } = req.body;

    // Only validate activation rules; do not modify images here
    if (status === 'Active') {
      const errs = await checkActivationRules({ categories, images: true });
      if (errs.length) return renderEditWithErrors(req, res, req.params.id, errs);
    }

    await Product.findByIdAndUpdate(
      req.params.id,
      {
        title,
        sku,
        price: Number(price),
        stockQty: Number(stockQty),
        status,
        categories: toArray(categories),
        slug: slugify(title, { lower: true, strict: true })
      },
      { runValidators: true }
    );

    res.redirect('/admin/products');
  } catch (e) {
    if (e.code === 11000 && e.keyPattern && e.keyPattern.sku) {
      return renderEditWithErrors(req, res, req.params.id, ['A product with this SKU already exists.']);
    }
    next(e);
  }
};

/* ----------------------------- GALLERY ACTIONS ------------------------- */
// Upload (file)
exports.addImage = async (req, res, next) => {
  try {
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).send('Product not found');

    const rel = relFromReqFile(req);
    if (!rel) return res.status(400).send('No file uploaded');

    prod.images = Array.isArray(prod.images) ? prod.images : [];
    prod.images.push(rel);
    if (!prod.image) prod.image = rel; // set cover if none yet
    await prod.save();

    res.redirect(`/admin/products/${prod._id}/edit`);
  } catch (e) { next(e); }
};

// Add by URL
exports.addImageByUrl = async (req, res, next) => {
  try {
    const url = String(req.body.imageUrl || '').trim();
    if (!url) return res.status(400).send('URL required');
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).send('Product not found');

    prod.images = Array.isArray(prod.images) ? prod.images : [];
    prod.images.push(url);
    if (!prod.image) prod.image = url;
    await prod.save();

    res.redirect(`/admin/products/${prod._id}/edit`);
  } catch (e) { next(e); }
};

// Remove one image by index
exports.removeImage = async (req, res, next) => {
  try {
    const idx = Number(req.params.index || -1);
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).send('Product not found');
    if (!Array.isArray(prod.images) || idx < 0 || idx >= prod.images.length) {
      return res.redirect(`/admin/products/${prod._id}/edit`);
    }
    const [removed] = prod.images.splice(idx, 1);
    if (prod.image === removed) prod.image = prod.images[0] || '';
    await prod.save();
    res.redirect(`/admin/products/${prod._id}/edit`);
  } catch (e) { next(e); }
};

// Make cover = move that image to index 0
exports.makeCover = async (req, res, next) => {
  try {
    const idx = Number(req.params.index || -1);
    const prod = await Product.findById(req.params.id);
    if (!prod) return res.status(404).send('Product not found');
    if (!Array.isArray(prod.images) || idx < 0 || idx >= prod.images.length) {
      return res.redirect(`/admin/products/${prod._id}/edit`);
    }
    const [img] = prod.images.splice(idx, 1);
    prod.images.unshift(img);
    prod.image = img;
    await prod.save();
    res.redirect(`/admin/products/${prod._id}/edit`);
  } catch (e) { next(e); }
};

// Save new order (from client-side drag)
exports.saveImageOrder = async (req, res, next) => {
  try {
    const order = req.body.order; // array of URLs in new order (or comma-separated)
    const prod  = await Product.findById(req.params.id);
    if (!prod) return res.status(404).send('Product not found');

    const desired = (Array.isArray(order) ? order : String(order || '').split(','))
      .map(s => String(s || '').trim())
      .filter(Boolean);

    // Keep only those that exist, then append any missing to avoid loss
    const current = (prod.images || []).map(String);
    const nextImages = desired.filter(src => current.includes(src));
    current.forEach(src => { if (!nextImages.includes(src)) nextImages.push(src); });

    prod.images = nextImages;
    prod.image = nextImages[0] || '';
    await prod.save();

    res.redirect(`/admin/products/${prod._id}/edit`);
  } catch (e) { next(e); }
};

/* ----------------------------- ADMIN: DELETE --------------------------- */
exports.destroy = async (req, res, next) => {
  try {
    const id = req.params.id;

    const used = await Order.exists({ 'items.productId': id });
    if (used) {
      await Product.findByIdAndUpdate(id, { isDeleted: true, status: 'Draft' });
      return res.redirect('/admin/products');
    }

    await Product.findByIdAndDelete(id);
    res.redirect('/admin/products');
  } catch (e) { next(e); }
};

/* --------------------------- STOREFRONT: LIST -------------------------- */
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

    res.render('storefront/index', {
      products, cats, q, cat, sort,
      page: pageNum, pages, total, currentCategory,
    });
  } catch (err) { next(err); }
};

/* ----------------------- STOREFRONT: DETAILS (slug) -------------------- */
exports.show = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      status: 'Active',
      isDeleted: { $ne: true }
    }).populate('categories').lean();

    if (!product) return res.status(404).send('Product not found');

    const qty      = Number(product.stockQty || 0);
    const inStock  = qty > 0;
    const lowStock = product.trackInventory !== false && inStock && qty <= 5;

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('storefront/show', { product, inStock, lowStock, flash });
  } catch (e) { next(e); }
};

/* ----------------------- STOREFRONT: DETAILS (id) ---------------------- */
exports.showById = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      _id: req.params.id,
      status: 'Active',
      isDeleted: { $ne: true }
    }).populate('categories').lean();

    if (!product) return res.status(404).send('Product not found');

    const qty      = Number(product.stockQty || 0);
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

    res.render('storefront/show', { product, inStock, lowStock, rating, reviews, flash });
  } catch (e) { next(e); }
};

/* ------------------------- ADMIN: LOW STOCK REPORT --------------------- */
exports.adminLowStock = async (req, res, next) => {
  try {
    const threshold = Math.max(0, parseInt(req.query.t, 10) || 5);
    const products = await Product.find({
      isDeleted: { $ne: true },
      status: 'Active',
      trackInventory: true,
      stockQty: { $gte: 0, $lte: threshold }
    }).sort({ stockQty: 1, title: 1 }).lean();

    res.render('reports/low_stock', { products, threshold });
  } catch (e) { next(e); }
};

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

    // breadcrumb demo
    const breadcrumbs = [];
    let ptr = currentCategory;
    while (ptr && (ptr.parentId || ptr.parent)) {
      const pid = ptr.parentId || ptr.parent;
      const parent = await Category.findById(pid).lean();
      if (!parent) break;
      breadcrumbs.unshift({ name: parent.name, slug: parent.slug });
      ptr = parent;
    }

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
      breadcrumbs
    });
  } catch (err) { next(err); }
};

/* -------------------------------- HELPERS ------------------------------ */
async function renderNewWithErrors(req, res, messages) {
  const cats = await Category.find({ status: 'Active' }).sort({ name: 1 });
  return res.status(400).render('products/new', {
    cats,
    errors: messages.map(msg => ({ msg })),
    values: req.body
  });
}
async function renderEditWithErrors(req, res, productId, messages) {
  const [product, cats] = await Promise.all([
    Product.findById(productId),
    Category.find({ status: 'Active' }).sort({ name: 1 })
  ]);
  return res.status(400).render('products/edit', {
    product,
    cats,
    errors: messages.map(msg => ({ msg })),
    values: req.body
  });
}
async function checkActivationRules({ categories, images }) {
  const errors = [];
  const catIds = toArray(categories);
  const imgs = toArray(images);

  if (imgs.filter(Boolean).length < 1) errors.push('To set status Active, add at least one image.');
  if (catIds.length < 1) {
    errors.push('To set status Active, select at least one category.');
  } else {
    const activeCount = await Category.countDocuments({ _id: { $in: catIds }, status: 'Active' });
    if (activeCount < 1) errors.push('Selected categories are not active. Choose at least one active category.');
  }
  return errors;
}
