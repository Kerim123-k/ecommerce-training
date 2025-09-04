// src/routes/product.routes.js
const router = require('express').Router();
const requireAdmin = require('../middleware/requireAdmin');
const { productUpload } = require('../middleware/upload');
const pc = require('../controllers/product.controller'); // <— use a single alias

// ===================== Admin (protected) =====================
router.use('/admin', requireAdmin);

// Admin: list/create/edit/delete
router.get('/admin/products', pc.adminIndex);
router.get('/admin/products/new', pc.adminNewForm);
router.post('/admin/products', productUpload.single('imageFile'), pc.adminCreate);

router.get('/admin/products/:id/edit', pc.adminEditForm);
router.post('/admin/products/:id', productUpload.single('imageFile'), pc.adminUpdate);
router.post('/admin/products/:id/delete', pc.adminDelete);

// NOTE: Image gallery (upload/reorder/primary/delete) is handled in
// src/routes/productImages.routes.js — do not duplicate routes here.

// ===================== Public storefront =====================
router.get('/products', pc.storefront);           // storefront grid (public)
router.get('/p/:slugOrId', pc.showEither);        // detail by slug OR id
router.get('/products/id/:id', pc.showById);      // legacy fallback by id
router.get('/c/:slug', pc.categoryPage);          // category landing

module.exports = router;
