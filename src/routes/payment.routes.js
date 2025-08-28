// src/routes/payment.routes.js
const router = require('express').Router();
const payment = require('../controllers/payment.controller');

// Demo card flow (no real payment)
router.get('/checkout/card', payment.cardForm);
router.post('/checkout/card', payment.cardCharge);

module.exports = router;
