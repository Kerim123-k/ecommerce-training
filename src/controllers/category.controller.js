// src/controllers/category.controller.js
const Category = require('../models/Category');
const Product  = require('../models/Product');
const slugify  = require('slugify');

// ADMIN: list categories (with product counts)
exports.list = async (_req, res, next) => {
  try {
    const cats = await Category.find().sort({ name: 1 }).lean();

    // counts per category
    const countsAgg = await Product.aggregate([
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$categories', count: { $sum: 1 } } }
    ]);
    const counts = Object.fromEntries(countsAgg.map(c => [String(c._id), c.count]));

    res.render('categories/index', { cats, counts });
  } catch (e) { next(e); }
};

// ADMIN: new form
exports.createForm = async (_req, res, next) => {
  try {
    const parents = await Category.find({ status: 'Active' }).sort({ name: 1 }).lean();
    res.render('categories/new', { parents, errors: [], values: {} });
  } catch (e) { next(e); }
};

// ADMIN: create
exports.create = async (req, res, next) => {
  try {
    const { name, status='Active', parentId, description } = req.body;
    await Category.create({
      name,
      status,
      parentId: parentId || null,
      description,
      slug: slugify(name, { lower: true, strict: true })
    });
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};

// ADMIN: edit form
exports.editForm = async (req, res, next) => {
  try {
    const cat = await Category.findById(req.params.id).lean();
    if (!cat) return res.status(404).send('Category not found');
    const parents = await Category
      .find({ _id: { $ne: cat._id }, status: 'Active' })
      .sort({ name: 1 })
      .lean();
    res.render('categories/edit', { cat, parents, errors: [], values: {} });
  } catch (e) { next(e); }
};

// ADMIN: update
exports.update = async (req, res, next) => {
  try {
    const { name, status='Active', parentId, description } = req.body;
    await Category.findByIdAndUpdate(
      req.params.id,
      {
        name,
        status,
        parentId: parentId || null,
        description,
        slug: slugify(name, { lower: true, strict: true })
      },
      { runValidators: true }
    );
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};

// ADMIN: delete
exports.destroy = async (req, res, next) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};
