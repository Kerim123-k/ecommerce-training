// src/routes/review.routes.js
const router = require('express').Router();
const r = require('../controllers/review.controller');
const requireAuth  = require('../middleware/requireAuth');
const requireAdmin = require('../middleware/requireAdmin');

// Public submit (must be logged in)
router.post('/reviews', requireAuth, r.create);
router.post('/reviews/:productId', requireAuth, r.create);

// Admin moderation
router.get('/admin/reviews', requireAdmin, r.adminList);
router.post('/admin/reviews/:id/approve', requireAdmin, r.approve);
router.post('/admin/reviews/:id/reject', requireAdmin, r.reject);

module.exports = router;
