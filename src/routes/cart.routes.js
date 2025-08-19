const router = require('express').Router();
const c = require('../controllers/cart.controller');
const requireAuth = require('../middleware/requireAuth');

router.get('/cart', c.view);
router.post('/cart/add/:id', c.add);
router.post('/cart/update', c.update);
router.post('/cart/clear', c.clear);

// Checkout
router.get('/checkout', requireAuth, c.showCheckout);
router.post('/checkout', requireAuth, c.placeOrder);

module.exports = router;
