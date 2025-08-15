// src/routes/order.routes.js
const router = require('express').Router();
const o = require('../controllers/order.controller');
const { requireLogin, requireActiveCustomer } = require('../middleware/auth');

// ---- Admin orders ----
router.get('/admin/orders', o.adminList);
router.get('/admin/orders/:id', o.adminShow);
router.post('/admin/orders/:id/process', o.adminProcess);
router.post('/admin/orders/:id/ship', o.adminShip);
router.post('/admin/orders/:id/deliver', o.adminDeliver);
router.post('/admin/orders/:id/cancel', o.adminCancel);

// ---- Customer checkout ----
router.get('/checkout', requireActiveCustomer, o.checkoutForm);
router.post('/checkout', requireActiveCustomer, o.checkout);
router.get('/order/:id/thank-you', o.thankYou);

module.exports = router;

