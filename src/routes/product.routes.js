const router = require('express').Router();
const { body } = require('express-validator');
const p = require('../controllers/product.controller');

// Shared validators for create & update
const createOrUpdateRules = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('sku')
    .trim()
    .customSanitizer(v => String(v || '').toUpperCase())
    .notEmpty().withMessage('SKU is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be ≥ 0'),
  body('stockQty').isInt({ min: 0 }).withMessage('Stock must be ≥ 0'),
];

// Admin
router.get('/admin/products', p.list);
router.get('/admin/products/new', p.createForm);
router.post('/admin/products', createOrUpdateRules, p.create);
router.get('/admin/products/:id/edit', p.editForm);
router.post('/admin/products/:id/edit', createOrUpdateRules, p.update);
router.post('/admin/products/:id/delete', p.destroy);

// Public storefront
router.get('/products', p.storefront);

module.exports = router;


