// src/routes/product.routes.js
const router = require('express').Router();
const { body } = require('express-validator');
const path = require('path');

const p = require('../controllers/product.controller');
const requireAdmin = require('../middleware/requireAdmin');
const { productUpload } = require('../middleware/upload'); // <-- correct uploader

// ---------- validators for admin create/update ----------
const createOrUpdateRules = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('sku')
    .trim()
    .customSanitizer(v => String(v || '').toUpperCase())
    .notEmpty()
    .withMessage('SKU is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be ≥ 0'),
  body('stockQty').isInt({ min: 0 }).withMessage('Stock must be ≥ 0'),
];

// Attach a browser-usable relative URL onto req.file (e.g. /uploads/products/2025/08/file.jpg)
function attachRelUrl(req, _res, next) {
  if (req.file && req.file.path) {
    const parts = req.file.path.split(path.sep + 'public' + path.sep);
    if (parts[1]) {
      req.file.relUrl = '/' + parts[1].replace(/\\/g, '/');
    }
  }
  next();
}

// ===================== Admin (protected) =====================
router.use('/admin', requireAdmin);

router.get('/admin/products', p.list);
router.get('/admin/products/new', p.createForm);

// Accept file (imageFile) and/or URL (image)
router.post(
  '/admin/products',
  productUpload.single('imageFile'),
  attachRelUrl,
  createOrUpdateRules,
  p.create
);

router.get('/admin/products/:id/edit', p.editForm);

router.post(
  '/admin/products/:id/edit',
  productUpload.single('imageFile'),
  attachRelUrl,
  createOrUpdateRules,
  p.update
);

router.post('/admin/products/:id/delete', p.destroy);

// Image gallery (upload/add/remove/reorder/cover)
router.post(
  '/admin/products/:id/images',
  productUpload.single('imageFile'),
  attachRelUrl,
  p.addImage
);
router.post('/admin/products/:id/images/url', p.addImageByUrl);
router.post('/admin/products/:id/images/order', p.saveImageOrder);
router.post('/admin/products/:id/images/:index/remove', p.removeImage);
router.post('/admin/products/:id/images/:index/cover', p.makeCover);

// Reports
router.get('/admin/reports/low-stock', p.adminLowStock);

// ===================== Public storefront =====================
router.get('/products', p.storefront);

// Canonical product detail by slug
router.get('/p/:slug', p.show);

// Fallback detail by id (for items without a slug)
router.get('/products/id/:id', p.showById);

// Backward-compatibility alias for old links like /products/some-slug
router.get('/products/:slug', (req, res) => {
  return res.redirect(301, `/p/${req.params.slug}`);
});

// Category landing page
router.get('/c/:slug', p.categoryPage);

module.exports = router;
