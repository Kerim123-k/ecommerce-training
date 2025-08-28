// src/models/Coupon.js
const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true }, // store UPPERCASE
  type: { type: String, enum: ['percent', 'amount'], required: true }, // % or fixed amount (in store currency)
  value: { type: Number, required: true, min: 0 }, // e.g., 10 (%), or 50 (₺)
  active: { type: Boolean, default: true },

  // Optional guards
  minSubtotal: { type: Number, default: 0 },      // require cart subtotal >= this
  startsAt:    { type: Date },                    // optional start date
  endsAt:      { type: Date },                    // optional end date
  maxUses:     { type: Number },                  // optional global cap
  usedCount:   { type: Number, default: 0 },      // tracked on successful orders

  notes: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Coupon', CouponSchema);
