// src/routes/account.routes.js
const router = require('express').Router();
const requireAuth = require('../middleware/requireAuth');

const account = require('../controllers/account.controller');
const orders  = require('../controllers/order.controller');

// All /account/* pages require login
router.use(requireAuth);

// Hub + orders
router.get('/account', account.dashboard);
router.get('/account/orders', account.orders);
router.get('/account/orders/:id', orders.myOrderShow);

// Customer → request order cancellation (POST)
router.post('/account/orders/:id/cancel-request', orders.requestCancelMy);

// Addresses (index-based UI living under /account/*)
router.get('/account/addresses', account.addressList);
router.get('/account/addresses/new', account.addressNewForm);
router.post('/account/addresses', account.addressCreate);
router.get('/account/addresses/:idx/edit', account.addressEditForm);
router.post('/account/addresses/:idx/edit', account.addressUpdate);
router.post('/account/addresses/:idx/delete', account.addressDelete);
router.post('/account/addresses/:idx/default', account.addressMakeDefault);

// Delete account
router.get('/account/delete', account.deleteForm);
router.post('/account/delete', account.deleteAccount);

module.exports = router;
