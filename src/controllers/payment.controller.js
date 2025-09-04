// src/controllers/payment.controller.js
const Product  = require('../models/Product');
const Customer = require('../models/Customer');
const Order    = require('../models/Order');

// ---- Email helpers (safe no-op fallback if the service file is missing) ----
let sendOrderConfirmation = async () => {};
try {
  ({ sendOrderConfirmation } = require('../services/orderEmails'));
} catch (e) {
  console.warn('[payment.controller] orderEmails service not found; emails disabled.');
}

const TAX_RATE = Number(process.env.TAX_RATE || 0);

const SHIPPING_METHODS = [
  { code: 'standard', label: 'Standard (2–4 days)', cost: 49 },
  { code: 'express',  label: 'Express (1–2 days)',  cost: 99 },
  { code: 'free',     label: 'Free shipping (≥ ₺200)', cost: 0, minSubtotal: 200 },
];

function pickShipping(code, subtotal) {
  let m = SHIPPING_METHODS.find(x => x.code === code) || SHIPPING_METHODS[0];
  if (m.code === 'free' && subtotal < (m.minSubtotal || Infinity)) m = SHIPPING_METHODS[0];
  return m;
}

function luhnOK(num) {
  const s = String(num || '').replace(/\D/g, '');
  if (s.length < 12) return false;
  let sum = 0, dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d; dbl = !dbl;
  }
  return sum % 10 === 0;
}

/* -------- GET: demo card form -------- */
exports.cardForm = (req, res) => {
  const cart = req.session?.cart || { items: [], subtotal: 0 };
  if (!cart.items.length) return res.redirect('/cart');

  const selectedShipping = req.query.method || 'standard';

  const subtotal = Number(
    (cart.items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0).toFixed(2)
  );

  const coupon = req.session.checkout?.coupon || null;
  let discount = 0;
  if (coupon) {
    const kind = (coupon.kind || coupon.type || '').toLowerCase();
    const val  = Number(coupon.value || 0);
    if (kind === 'percent' || kind === 'percentage') {
      discount = Number((subtotal * Math.max(0, Math.min(100, val)) / 100).toFixed(2));
    } else {
      discount = Math.min(subtotal, Number(val.toFixed(2)));
    }
  }

  const taxableBase = Math.max(0, subtotal - discount);
  const tax  = Number((taxableBase * TAX_RATE).toFixed(2));
  const ship = pickShipping(selectedShipping, subtotal);
  const shippingCost = ship.code === 'free' ? 0 : Number(ship.cost || 0);
  const grandTotal = Number((taxableBase + tax + shippingCost).toFixed(2));

  res.render('checkout/card', {
    cart,
    selectedShipping,
    shippingLabel: ship.label,
    totals: { subtotal, discount, tax, shipping: shippingCost, grandTotal },
    appliedCoupon: coupon || null,
    errors: [],
    values: {}
  });
};

/* ------------- POST: accept card + create Paid order (demo) ------------- */
exports.cardCharge = async (req, res, next) => {
  try {
    const cart = req.session?.cart || { items: [] };
    if (!cart.items.length) return res.redirect('/cart');

    const {
      name = '', number = '', expMonth = '', expYear = '', cvv = '',
    } = req.body;

    // shipping method is carried via query (?method=express|standard|free)
    const selectedShipping = req.query.method || 'standard';

    const subtotal = Number(
      (cart.items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0).toFixed(2)
    );

    const coupon = req.session.checkout?.coupon || null;
    let discount = 0;
    if (coupon) {
      const kind = (coupon.kind || coupon.type || '').toLowerCase();
      const val  = Number(coupon.value || 0);
      discount = (kind === 'percent' || kind === 'percentage')
        ? Number((subtotal * Math.max(0, Math.min(100, val)) / 100).toFixed(2))
        : Math.min(subtotal, Number(val.toFixed(2)));
    }

    const taxableBase = Math.max(0, subtotal - discount);
    const tax  = Number((taxableBase * TAX_RATE).toFixed(2));
    const ship = pickShipping(selectedShipping, subtotal);
    const shippingCost = ship.code === 'free' ? 0 : Number(ship.cost || 0);
    const grandTotal = Number((taxableBase + tax + shippingCost).toFixed(2));

    const errors = [];
    if (!name.trim()) errors.push({ msg: 'Cardholder name is required.' });
    if (!luhnOK(number)) errors.push({ msg: 'Enter a Luhn-valid card number (e.g. 4242 4242 4242 4242).' });
    if (!/^\d{2}$/.test(String(expMonth))) errors.push({ msg: 'Invalid expiry month.' });
    if (!/^\d{2,4}$/.test(String(expYear))) errors.push({ msg: 'Invalid expiry year.' });
    if (!/^\d{3,4}$/.test(String(cvv))) errors.push({ msg: 'Invalid CVV.' });

    if (errors.length) {
      return res.status(400).render('checkout/card', {
        cart,
        selectedShipping,
        shippingLabel: ship.label,
        totals: { subtotal, discount, tax, shipping: shippingCost, grandTotal },
        appliedCoupon: coupon || null,
        errors,
        values: req.body
      });
    }

    // Resolve default address (if logged in)
    const userId = req.session?.user?._id || null;
    let shippingAddress = null;
    let me = null;
    if (userId) {
      me = await Customer.findById(userId).lean();
      const addr = (me?.addresses || []).find(a => a.isDefault) || (me?.addresses || [])[0];
      if (addr) {
        shippingAddress = {
          firstName: addr.firstName, lastName: addr.lastName,
          line1: addr.line1, line2: addr.line2 || '',
          city: addr.city, province: addr.province || '',
          postalCode: addr.postalCode || '', country: addr.country || 'TR',
          phone: addr.phone || ''
        };
      }
    }

    // Validate items against DB
    const ids = cart.items.map(i => i.productId);
    const dbProducts = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } });
    const items = cart.items.map(i => {
      const p = dbProducts.find(d => String(d._id) === String(i.productId));
      if (!p || p.status !== 'Active') throw new Error(`${i.title} unavailable`);
      if (p.trackInventory && p.stockQty < i.qty) throw new Error(`Insufficient stock for ${p.title}`);
      return { productId: p._id, sku: p.sku, title: p.title, qty: i.qty, unitPrice: p.price };
    });

    // choose recipient: customer email if known, else ADMIN_EMAIL fallback
    const customerEmail = (req.session?.user?.email || me?.email || process.env.ADMIN_EMAIL || '').trim();

    const order = await Order.create({
      orderNo: 'ORD-' + Math.floor(Date.now() / 1000),
      customerId: userId,
      customerEmail,
      items,
      subtotal,
      discount,
      tax,
      shipping: shippingCost,
      grandTotal,
      shippingAddress,
      status: 'Paid',
      paymentMethod: 'Card (Demo)',
      paymentStatus: 'Paid',
      timeline: [{ at: new Date(), status: 'Paid', note: 'Paid via Demo Card' }],
      // record coupon details if present
      couponCode: coupon?.code || coupon?.name || null,
    });

    // fire-and-forget confirmation email (won’t block checkout)
    sendOrderConfirmation(order).catch(err => {
      console.warn('[email] sendOrderConfirmation failed:', err?.message || err);
    });

    // decrement stock
    await Promise.all(items.map(it =>
      Product.updateOne(
        { _id: it.productId, trackInventory: true },
        { $inc: { stockQty: -it.qty } }
      )
    ));

    // clear cart & coupon
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
    if (req.session.checkout) delete req.session.checkout.coupon;

    res.redirect(`/account/orders/${order._id}`);
  } catch (e) { next(e); }
};
