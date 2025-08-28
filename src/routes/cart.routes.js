// src/routes/cart.routes.js
const router = require('express').Router();
const c = require('../controllers/cart.controller');

// ----- Cart -----
router.get('/cart', c.view);

// Add to cart — support BOTH shapes and BOTH verbs
router.post('/cart/:id/add', c.add);
router.get('/cart/:id/add', c.add);
router.post('/cart/add/:id', c.add);
router.get('/cart/add/:id', c.add);

router.post('/cart/update', c.update);
router.post('/cart/clear', c.clear);

// ----- Checkout -----
router.get('/checkout', c.showCheckout);
router.post('/checkout', c.placeOrder);

// Coupon actions (separate from place-order)
router.post('/checkout/coupon/apply', c.applyCoupon);
router.post('/checkout/coupon/remove', c.removeCoupon);

// Thank you
router.get('/checkout/thankyou', c.thankyou);

module.exports = router;
