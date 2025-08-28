// src/services/coupons.js
const Coupon = require('../models/Coupon');

function now() { return new Date(); }

function withinWindow(c) {
  const t = now();
  if (c.startsAt && t < c.startsAt) return false;
  if (c.endsAt && t > c.endsAt) return false;
  return true;
}

function computeDiscount(coupon, subtotal) {
  if (!coupon || subtotal <= 0) return 0;
  let d = 0;
  if (coupon.type === 'percent') d = subtotal * (coupon.value / 100);
  else if (coupon.type === 'amount') d = coupon.value;
  d = Math.max(0, Math.min(d, subtotal)); // never over-discount
  return Number(d.toFixed(2));
}

async function validateAndPrice(code, subtotal) {
  if (!code) return { ok: false, reason: 'No code' };
  const coupon = await Coupon.findOne({ code: String(code).trim().toUpperCase() }).lean();
  if (!coupon) return { ok: false, reason: 'Invalid code' };
  if (!coupon.active) return { ok: false, reason: 'This coupon is inactive' };
  if (!withinWindow(coupon)) return { ok: false, reason: 'This coupon is not currently valid' };
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    return { ok: false, reason: 'This coupon has reached its usage limit' };
  }
  if (subtotal < (coupon.minSubtotal || 0)) {
    return { ok: false, reason: `Requires subtotal ≥ ${coupon.minSubtotal}` };
  }
  const discount = computeDiscount(coupon, subtotal);
  if (discount <= 0) return { ok: false, reason: 'No discount for this cart' };
  return { ok: true, coupon, discount };
}

module.exports = { validateAndPrice, computeDiscount };
