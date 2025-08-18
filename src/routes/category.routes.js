// src/routes/category.routes.js
const router = require('express').Router();
const c = require('../controllers/category.controller');

// Admin
router.get('/admin/categories', c.list);
router.get('/admin/categories/new', c.createForm);
router.post('/admin/categories', c.create);
router.get('/admin/categories/:id/edit', c.editForm);
router.post('/admin/categories/:id/edit', c.update);
router.post('/admin/categories/:id/delete', c.destroy);

module.exports = router;


