const router = require('express').Router();
const { body } = require('express-validator');
const requireAuth = require('../middleware/requireAuth');
const { ensureAuth } = require('../middleware/auth');
const a = require('../controllers/account.controller');

// everything below requires login
router.use('/account', requireAuth);

router.get('/account', a.dashboard);

// addresses
router.get('/account/addresses', a.addressList);
router.get('/account/addresses/new', a.addressNewForm);
router.post('/account/addresses', [
  body('line1').trim().notEmpty().withMessage('Address line 1 is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('country').trim().notEmpty().withMessage('Country is required')
], a.addressCreate);

router.get('/account/addresses/:idx/edit', a.addressEditForm);
router.post('/account/addresses/:idx/edit', [
  body('line1').trim().notEmpty(),
  body('city').trim().notEmpty(),
  body('country').trim().notEmpty()
], a.addressUpdate);

router.post('/account/addresses/:idx/delete', a.addressDelete);
router.post('/account/addresses/:idx/default', a.addressMakeDefault);

// order history
router.get('/account/orders', a.orderHistory);


router.get('/account', ensureAuth, a.dashboard);          // simple redirect
router.get('/account/orders', ensureAuth, a.orders); 

module.exports = router;
