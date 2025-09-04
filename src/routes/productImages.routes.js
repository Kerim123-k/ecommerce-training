// src/routes/productImages.routes.js
const router = require('express').Router();
const requireAdmin = require('../middleware/requireAdmin');
const { productUpload } = require('../middleware/upload'); // ⬅️ use your existing uploader
const c = require('../controllers/productImages.controller');

// all admin image routes require admin
router.use('/admin/products/:id/images', requireAdmin);

// Manage page
router.get('/admin/products/:id/images', c.managePage);

// Upload multiple (up to 12 images)
router.post(
  '/admin/products/:id/images/upload',
  productUpload.array('images', 12),       // ⬅️ here
  c.upload
);

// Set primary (move selected to index 0)
router.post('/admin/products/:id/images/set-primary', c.setPrimary);

// Reorder via CSV indices (e.g., "2,0,1")
router.post('/admin/products/:id/images/reorder', c.reorder);

// Delete single by index
router.post('/admin/products/:id/images/:idx/delete', c.destroy);

module.exports = router;
