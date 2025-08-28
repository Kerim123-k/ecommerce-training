// src/lib/totals.js
const TAX_RATE = Number(process.env.TAX_RATE || 0);

const shippingMethods = [
  { code: 'standard', label: 'Standard (2–4 days)', cost: 49 },
  { code: 'express',  label: 'Express (1–2 days)',  cost: 99 },
  { code: 'free',     label: 'Free shipping (≥ ₺200)', cost: 0, minSubtotal: 200 },
];

function pickShipping(code, subtotal) {
  let m = shippingMethods.find(x => x.code === code) || shippingMethods[0];
  if (m.code === 'free' && subtotal < (m.minSubtotal || Infinity)) {
    m = shippingMethods[0];
  }
  return m;
}

function calcTotals(cart, shippingCode, coupon) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const subtotal = Number(
    items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0).toFixed(2)
  );

  // coupon
  let discount = 0;
  if (coupon && coupon.code) {
    if (coupon.kind === 'amount') {
      discount = Math.min(Number(coupon.value || 0), subtotal);
    } else if (coupon.kind === 'percent') {
      const raw = subtotal * (Number(coupon.value || 0) / 100);
      const capped = coupon.maxDiscount ? Math.min(raw, Number(coupon.maxDiscount)) : raw;
      discount = Math.min(capped, subtotal);
    }
  }
  discount = Number(discount.toFixed(2));

  const taxableBase = Math.max(0, subtotal - discount);
  const tax = Number((taxableBase * TAX_RATE).toFixed(2));

  const ship = pickShipping(shippingCode, subtotal);
  const shippingCost = Number((ship.code === 'free' ? 0 : ship.cost || 0));

  const grandTotal = Number((taxableBase + tax + shippingCost).toFixed(2));

  return {
    subtotal,
    discount,
    tax,
    shippingCost,
    shippingMethod: ship.code,
    grandTotal
  };
}

module.exports = {
  calcTotals,
  shippingMethods,
  pickShipping
};
