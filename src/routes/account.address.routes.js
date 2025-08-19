// src/routes/account.address.routes.js
const router = require('express').Router();
const c = require('../controllers/address.controller');
const requireAuth = require('../middleware/requireAuth');

// Everything under /account/addresses requires login
router.use(requireAuth);

router.get('/account/addresses', c.list);
router.get('/account/addresses/new', c.createForm);
router.post('/account/addresses', c.create);
router.get('/account/addresses/:addrId/edit', c.editForm);
router.post('/account/addresses/:addrId/edit', c.update);
router.post('/account/addresses/:addrId/delete', c.destroy);
router.post('/account/addresses/:addrId/default', c.setDefault);

module.exports = router;
