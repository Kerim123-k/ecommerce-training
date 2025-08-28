// src/routes/wishlist.routes.js
const router = require('express').Router();
const w = require('../controllers/wishlist.controller');

router.get('/wishlist', w.index);
router.post('/wishlist/add/:id', w.add);
router.post('/wishlist/remove/:id', w.remove);
router.post('/wishlist/clear', w.clear);
router.post('/wishlist/toggle/:id', w.toggle);
router.post('/wishlist/toggle/:id', w.toggle);
module.exports = router;
