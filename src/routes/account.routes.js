const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');
const a = require('../controllers/account.controller');

// All /account/* pages require login
router.use(requireAuth);

// Dashboard & orders
router.get('/account', a.dashboard);
router.get('/account/orders', a.orders);

// Addresses (index-based)
router.get('/account/addresses', a.addressList);
router.get('/account/addresses/new', a.addressNewForm);
router.post('/account/addresses', a.addressCreate);
router.get('/account/addresses/:idx/edit', a.addressEditForm);
router.post('/account/addresses/:idx/edit', a.addressUpdate);
router.post('/account/addresses/:idx/delete', a.addressDelete);
router.post('/account/addresses/:idx/default', a.addressMakeDefault);

module.exports = router;
