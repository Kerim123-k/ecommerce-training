// shipping & tax config
exports.shippingMethods = [
  { code: 'standard', label: 'Standard (2-5 days)', cost: 49 },
  { code: 'express',  label: 'Express (1-2 days)',  cost: 99 },
  { code: 'free',     label: 'Free over ₺750',      cost: 0, minSubtotal: 750 },
];
exports.taxRate = 0.08; // 8%
