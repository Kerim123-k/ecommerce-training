// src/controllers/product.controller.js
const Product = require('../models/Product');
const Category = require('../models/Category');
const slugify = require('slugify');
const { validationResult } = require('express-validator');
const toArray = (v) => Array.isArray(v) ? v : (v ? [v] : []);
const Order = require('../models/Order');
const mongoose = require('mongoose');
/**
 * List (admin)
 */
exports.list = async (_req, res) => {
  const products = await Product.find({ isDeleted: { $ne: true } })
  .populate('categories')
  .sort({ createdAt: -1 });

  res.render('products/index', { products });
};

/**
 * Create form (admin)
 */
exports.createForm = async (_req, res) => {
  const cats = await Category.find({ status: 'Active' }).sort({ name: 1 });
  res.render('products/new', { cats, errors: [], values: {} });
};

/**
 * Create (admin) — with PRD rule: Active requires image + category
 */
exports.create = async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderNewWithErrors(req, res, result.array().map(e => e.msg));
    }

    // duplicate by SKU (case-insensitive because we upper-cased it in the route)
    const exists = await Product.exists({ sku: req.body.sku, isDeleted: { $ne: true } });
    if (exists) return renderNewWithErrors(req, res, ['A product with this SKU already exists.']);

    const { title, sku, price, stockQty, status='Draft', categories=[], image } = req.body;

    // ENFORCE activation rules if trying to set Active
    if (status === 'Active') {
      const errs = await checkActivationRules({ categories, images: image });
      if (errs.length) return renderNewWithErrors(req, res, errs);
    }

    await Product.create({
      title,
      sku,
      price: Number(price),
      stockQty: Number(stockQty),
      status,
      categories: toArray(categories),
      images: image ? [image] : [],
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


/**
 * Public storefront (active products only)
 */
exports.storefront = async (req, res, next) => {
  try {
    const { q = '', cat = '', sort = 'new', page = 1 } = req.query;
    const limit = 12;

    const match = { status: 'Active', isDeleted: { $ne: true } };

    // search by title/sku (case-insensitive)
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(safe, 'i');
      match.$or = [{ title: re }, { sku: re }];
    }

    // category filter
    if (cat && mongoose.Types.ObjectId.isValid(cat)) {
      match.categories = new mongoose.Types.ObjectId(cat);
    }

    // sort
    const sortMap = {
      new:        { createdAt: -1 },
      price_asc:  { price: 1 },
      price_desc: { price: -1 },
    };
    const sortObj = sortMap[sort] || sortMap.new;

    const [products, total, cats] = await Promise.all([
      Product.find(match)
        .sort(sortObj)
        .skip((Number(page) - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(match),
      Category.find({ status: 'Active' }).sort({ name: 1 }).lean(),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    res.render('storefront/index', {
      products, cats,
      q, cat, sort,
      page: Number(page), pages, total
    });
  } catch (e) { next(e); }
};


/**
 * Edit form (admin)
 */
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

/**
 * Update (admin) — with PRD rule: Active requires image + category
 */
exports.update = async (req, res, next) => {
  try {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderEditWithErrors(req, res, req.params.id, result.array().map(e => e.msg));
    }

    // duplicate by SKU (ignore current doc), also ignore soft-deleted
    const dup = await Product.exists({ sku: req.body.sku, _id: { $ne: req.params.id }, isDeleted: { $ne: true } });
    if (dup) return renderEditWithErrors(req, res, req.params.id, ['A product with this SKU already exists.']);

    const { title, sku, price, stockQty, status='Draft', categories=[], image } = req.body;

    // ENFORCE activation rules if trying to set Active
    if (status === 'Active') {
      const errs = await checkActivationRules({ categories, images: image });
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
        images: image ? [image] : [],
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


/**
 * Delete (admin)
 */
exports.destroy = async (req, res, next) => {
  try {
    const id = req.params.id;

    // If product appears in any order items, soft-delete instead of hard delete
    const used = await Order.exists({ 'items.productId': id });
    if (used) {
      await Product.findByIdAndUpdate(id, { isDeleted: true, status: 'Draft' });
      return res.redirect('/admin/products');
    }

    await Product.findByIdAndDelete(id);
    res.redirect('/admin/products');
  } catch (e) { next(e); }
};

exports.show = async (req, res, next) => {
  try {
    const product = await Product.findOne({
      slug: req.params.slug,
      status: 'Active',
      isDeleted: { $ne: true }
    }).populate('categories').lean();

    if (!product) {
      return res.status(404).render('errors/404', { title: 'Not found' });
      // or: return res.status(404).send('Product not found');
    }

    res.render('storefront/show', { product });
  } catch (e) { next(e); }
};


/* ------------------------ helpers ------------------------ */

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
    product, cats,
    errors: messages.map(msg => ({ msg })),
    values: req.body
  });
}

async function checkActivationRules({ categories, images }) {
  const errors = [];
  const catIds = toArray(categories);
  const imgs = Array.isArray(images) ? images : (images ? [images] : []);

  // need at least 1 image URL (non-empty)
  if (imgs.filter(Boolean).length < 1) {
    errors.push('To set status Active, add at least one image URL.');
  }

  // need at least 1 *active* category
  if (catIds.length < 1) {
    errors.push('To set status Active, select at least one category.');
  } else {
    const activeCount = await Category.countDocuments({ _id: { $in: catIds }, status: 'Active' });
    if (activeCount < 1) errors.push('Selected categories are not active. Choose at least one active category.');
  }

  return errors;
}
