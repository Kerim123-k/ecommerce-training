// src/routes/wishlist.routes.js
const express = require('express');
const router = express.Router();
const w = require('../controllers/wishlist.controller');

// Sanity check – if any controller is missing you’ll see it in the console
['index', 'add', 'remove', 'clear', 'toggle'].forEach(k => {
  if (typeof w[k] !== 'function') {
    console.error(`[wishlist.routes] Missing controller function: ${k}`);
  }
});

// Keep the paths simple first (no regex); we’ll validate ObjectId inside controllers
router.get('/wishlist', w.index);
router.post('/wishlist/add/:id',    w.add);
router.post('/wishlist/remove/:id', w.remove);
router.post('/wishlist/clear',      w.clear);
router.post('/wishlist/toggle/:id', w.toggle);

module.exports = router;
