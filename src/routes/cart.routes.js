// src/routes/cart.routes.js
const router = require('express').Router();
const c = require('../controllers/cart.controller');

// Cart
router.get('/cart', c.view);
router.post('/cart/add/:id', c.add);
router.post('/cart/update', c.update);
router.post('/cart/clear', c.clear);

// Checkout
router.get('/checkout', c.showCheckout);
router.post('/checkout/coupon/apply', c.applyCoupon);   // ← POST
router.post('/checkout/coupon/remove', c.removeCoupon); // ← POST
router.post('/checkout/place', c.placeOrder);
router.get('/checkout/thankyou', c.thankyou);

module.exports = router;
