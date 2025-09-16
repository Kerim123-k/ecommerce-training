// src/controllers/review.controller.js
'use strict';

const mongoose = require('mongoose');
const Review   = require('../models/Review');
const Product  = require('../models/Product');

// POST /reviews  (must be logged in via requireAuth)
exports.create = async (req, res, next) => {
  try {
    const { productId, rating, title = '', body = '' } = req.body;

    // --- Basic validation ---
    const errors = [];
    if (!productId) errors.push('Missing product.');
    const r = Number(rating);
    if (!(r >= 1 && r <= 5)) errors.push('Please choose a rating between 1 and 5.');
    if (!body || String(body).trim().length < 5) errors.push('Please write a short review (min 5 chars).');

    const product = productId ? await Product.findById(productId).lean() : null;
    if (!product) errors.push('Product not found.');

    // Decide product detail URL (slug first, else ID)
    const detailUrl = product
      ? (product.slug ? `/p/${product.slug}` : `/products/id/${product._id}`)
      : '/products';

    if (errors.length) {
      req.session.flash = errors.join(' ');
      return res.redirect(detailUrl);
    }

    const u = req.session.user || {};
    const customerId = u._id ? new mongoose.Types.ObjectId(u._id) : null;

    // One-review-per-customer-per-product:
    // If a review exists, update it (and re-mark as Pending).
    const existing = await Review.findOne({
      productId: new mongoose.Types.ObjectId(product._id),
      customerId: customerId
    });

    if (existing) {
      if (existing.status === 'Approved') {
        // policy: do not allow changing an already approved review
        req.session.flash = 'You already have an approved review for this product.';
        return res.redirect(detailUrl);
      }

      await Review.updateOne(
        { _id: existing._id },
        {
          $set: {
            rating: r,
            title: title || '',
            body:  body  || '',
            status: 'Pending',
            updatedAt: new Date()
          }
        }
      );

      req.session.flash = 'Thanks! Your review was updated and resubmitted for approval.';
      return res.redirect(detailUrl);
    }

    // Otherwise, create a new review
    await Review.create({
      productId:      new mongoose.Types.ObjectId(product._id),
      customerId:     customerId,
      customerEmail:  u.email || '',
      customerName:   u.name  || '',
      rating:         r,
      title:          title || '',
      body:           body  || '',
      status:         'Pending',
    });

    req.session.flash = 'Thanks! Your review was submitted and will appear after approval.';
    return res.redirect(detailUrl);
  } catch (e) {
    // Gracefully handle rare race condition against the unique index
    if (e && e.code === 11000) {
      try {
        const u = req.session.user || {};
        const customerId = u._id ? new mongoose.Types.ObjectId(u._id) : null;
        const { productId, rating, title = '', body = '' } = req.body;
        const product = await Product.findById(productId).lean();
        const detailUrl = product
          ? (product.slug ? `/p/${product.slug}` : `/products/id/${product._id}`)
          : '/products';

        await Review.updateOne(
          { productId: new mongoose.Types.ObjectId(productId), customerId },
          {
            $set: {
              rating: Number(rating),
              title: title || '',
              body:  body  || '',
              status: 'Pending',
              updatedAt: new Date()
            }
          }
        );
        req.session.flash = 'Your review was updated and resubmitted for approval.';
        return res.redirect(detailUrl);
      } catch (inner) {
        return next(inner);
      }
    }
    return next(e);
  }
};

// GET /admin/reviews
exports.adminList = async (req, res, next) => {
  try {
    const { status = '', q = '', page = 1 } = req.query;
    const limit = 15;
    const pg = Math.max(1, parseInt(page, 10) || 1);

    const match = {};
    if (status) match.status = status;
    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      match.$or = [
        { customerEmail: rx },
        { customerName:  rx },
        { title: rx },
        { body:  rx },
      ];
    }

    const [rows, total] = await Promise.all([
      Review.find(match)
        .populate('productId', 'title slug sku')
        .sort({ createdAt: -1 })
        .skip((pg - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments(match),
    ]);
    const pages = Math.max(1, Math.ceil(total / limit));

    res.render('reviews/admin_index', { rows, status, q, page: pg, pages, total });
  } catch (e) { next(e); }
};

// POST /admin/reviews/:id/approve
exports.approve = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status: 'Approved' },
      { new: true }
    );
    if (review) await recomputeProductRating(review.productId);
    res.redirect('/admin/reviews');
  } catch (e) { next(e); }
};

// POST /admin/reviews/:id/reject
exports.reject = async (req, res, next) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected' },
      { new: true }
    );
    if (review) await recomputeProductRating(review.productId);
    res.redirect('/admin/reviews');
  } catch (e) { next(e); }
};

async function recomputeProductRating(productId) {
  const [stats] = await Review.aggregate([
    { $match: { productId: new mongoose.Types.ObjectId(productId), status: 'Approved' } },
    { $group: { _id: null, count: { $sum: 1 }, avg: { $avg: '$rating' } } }
  ]);
  const ratingCount = stats?.count || 0;
  const ratingAvg   = stats ? Number(stats.avg.toFixed(2)) : 0;
  await Product.updateOne({ _id: productId }, { ratingAvg, ratingCount });
}
