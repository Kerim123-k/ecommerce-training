// src/controllers/category.controller.js
const Category = require('../models/Category');
const Product = require('../models/Product');      // ⬅️ add this
const slugify = require('slugify');

exports.list = async (_req, res, next) => {        // ⬅️ replace your list with this
  try {
    const cats = await Category.find().sort({ name: 1 });

    // Aggregate how many products are assigned to each category
    const countsAgg = await Product.aggregate([
      { $unwind: { path: '$categories', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$categories', count: { $sum: 1 } } }
    ]);

    const counts = Object.fromEntries(countsAgg.map(c => [String(c._id), c.count]));

    res.render('categories/index', { cats, counts });
  } catch (e) { next(e); }
};

exports.createForm = async (_req, res) => {
  const parents = await Category.find({ status: 'Active' }).sort({ name: 1 });
  res.render('categories/new', { parents, errors: [], values: {} });
};

exports.create = async (req, res, next) => {
  try {
    const { name, status='Active', parentId, description } = req.body; // ⬅️ accept parentId
    await Category.create({
      name,
      status,
      parentId: parentId || null,                                     // ⬅️ store parent if provided
      description,
      slug: slugify(name, { lower: true, strict: true })
    });
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};

exports.editForm = async (req, res, next) => {
  try {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).send('Category not found');
    res.render('categories/edit', { cat });
  } catch (e) { next(e); }
};

exports.update = async (req, res, next) => {
  try {
    const { name, status='Active', description } = req.body;
    await Category.findByIdAndUpdate(
      req.params.id,
      {
        name,
        status,
        description,
        slug: slugify(name, { lower: true, strict: true })
      },
      { runValidators: true }
    );
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};

exports.destroy = async (req, res, next) => {
  try {
    await Category.findByIdAndDelete(req.params.id);
    res.redirect('/admin/categories');
  } catch (e) { next(e); }
};
