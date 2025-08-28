// src/routes/coupon.routes.js
const router = require('express').Router();
const requireAdmin = require('../middleware/requireAdmin');
const c = require('../controllers/coupon.controller');

// Admin-only
router.use('/admin', requireAdmin);

router.get('/admin/coupons', c.index);
router.get('/admin/coupons/new', c.newForm);
router.post('/admin/coupons', c.create);
router.post('/admin/coupons/:id/toggle', c.toggle);
router.post('/admin/coupons/:id/delete', c.destroy);

module.exports = router;
