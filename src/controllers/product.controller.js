// src/controllers/product.controller.js
const Product = require('../models/Product');
const Category = require('../models/Category');
const slugify = require('slugify');
const { validationResult } = require('express-validator');

/**
 * List (admin)
 */
exports.list = async (_req, res) => {
  const products = await Product.find().populate('categories').sort({ createdAt: -1 });
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

    // Duplicate by SKU (case-insensitive handled in route sanitizer to UPPER)
    const exists = await Product.exists({ sku: req.body.sku });
    if (exists) return renderNewWithErrors(req, res, ['A product with this SKU already exists.']);

    const { title, sku, price, stockQty, status = 'Draft', categories = [], image } = req.body;

    // Normalize arrays
    const catsArr   = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const imagesArr = image ? [image] : [];

    // PRD rule: cannot activate without ≥1 image & ≥1 category
    if (status === 'Active' && (catsArr.length === 0 || imagesArr.length === 0)) {
      return renderNewWithErrors(req, res, ['Active products must have at least one category and one image.']);
    }

    await Product.create({
      title,
      sku,
      price: Number(price),
      stockQty: Number(stockQty),
      status,
      categories: catsArr,
      images: imagesArr,
      slug: slugify(title, { lower: true, strict: true })
    });

    res.redirect('/admin/products');
  } catch (e) {
    // Mongo unique index error fallback
    if (e.code === 11000 && e.keyPattern && e.keyPattern.sku) {
      return renderNewWithErrors(req, res, ['A product with this SKU already exists.']);
    }
    next(e);
  }
};

/**
 * Public storefront (active products only)
 */
exports.storefront = async (_req, res) => {
  const products = await Product.find({ status: 'Active' }).sort({ createdAt: -1 });
  res.render('storefront/index', { products });
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

    // Duplicate by SKU (ignore current doc)
    const dup = await Product.exists({ sku: req.body.sku, _id: { $ne: req.params.id } });
    if (dup) return renderEditWithErrors(req, res, req.params.id, ['A product with this SKU already exists.']);

    const { title, sku, price, stockQty, status = 'Draft', categories = [], image } = req.body;

    // Normalize arrays
    const catsArr   = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    const imagesArr = image ? [image] : [];

    // PRD rule: cannot activate without ≥1 image & ≥1 category
    if (status === 'Active' && (catsArr.length === 0 || imagesArr.length === 0)) {
      return renderEditWithErrors(req, res, req.params.id, ['Active products must have at least one category and one image.']);
    }

    await Product.findByIdAndUpdate(
      req.params.id,
      {
        title,
        sku,
        price: Number(price),
        stockQty: Number(stockQty),
        status,
        categories: catsArr,
        images: imagesArr,
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
    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/admin/products');
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
