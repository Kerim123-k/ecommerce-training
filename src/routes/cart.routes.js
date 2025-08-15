const router = require('express').Router();
const c = require('../controllers/cart.controller');

router.get('/cart', c.view);
router.post('/cart/add/:id', c.add);
router.post('/cart/update', c.update);
router.post('/cart/clear', c.clear);

module.exports = router;
