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

// Same shipping options you show on checkout
const SHIPPING_METHODS = [
  { code: 'standard', label: 'Standard (2–4 days)', cost: 49 },
  { code: 'express',  label: 'Express (1–2 days)',  cost: 99 },
  { code: 'free',     label: 'Free shipping (≥ ₺200)', cost: 0, minSubtotal: 200 },
];

function calcTotals(cart, shipCode, discountAmount = 0) {
  const subtotal = Number(
    (cart.items || []).reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0).toFixed(2)
  );

  let m = SHIPPING_METHODS.find(x => x.code === shipCode) || SHIPPING_METHODS[0];
  if (m.code === 'free' && subtotal < (m.minSubtotal || Infinity)) m = SHIPPING_METHODS[0];

  const shipping = Number((m.code === 'free' ? 0 : m.cost || 0));
  const discount = Math.max(0, Math.min(Number(discountAmount || 0), subtotal));
  const taxable  = Math.max(0, subtotal - discount);
  const tax      = Number((taxable * TAX_RATE).toFixed(2));
  const grand    = Number((taxable + tax + shipping).toFixed(2));

  return {
    subtotal,
    discount,
    tax,
    shipping,
    shippingMethod: m.code,
    grandTotal: grand
  };
}

// Minimal Luhn check (demo)
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

  const ck = req.session.checkout || {};
  const selectedShipping = (req.query.method || ck.shippingMethod || 'standard').trim();

  // accept ?d=<discount> (fallback to session)
  const discount = (req.query.d != null)
    ? Number(req.query.d)
    : Number(ck.discount || 0);

  const totals = calcTotals(cart, selectedShipping, discount);

  res.render('checkout/card', {
    cart,
    totals,
    shippingMethods: SHIPPING_METHODS,
    selectedShipping,
    errors: [],
    values: {}
  });
};

/* ------------- POST: accept card + create a Paid order (demo) ------------- */
exports.cardCharge = async (req, res, next) => {
  try {
    const cart = req.session?.cart || { items: [] };
    if (!cart.items.length) return res.redirect('/cart');

    const {
      name = '',
      number = '',
      expMonth = '',
      expYear = '',
      cvv = '',
      shippingMethod = (req.session.checkout && req.session.checkout.shippingMethod) || 'standard',

      // hidden field from the card page
      discount: postedDiscount
    } = req.body;

    // pull discount again (prefer POST hidden field; fallback session)
    const discount = (postedDiscount != null)
      ? Number(postedDiscount)
      : Number(req.session.checkout?.discount || 0);

    const totals = calcTotals(cart, shippingMethod, discount);

    const errors = [];
    if (!name.trim()) errors.push({ msg: 'Cardholder name is required.' });
    if (!luhnOK(number)) errors.push({ msg: 'Enter a Luhn-valid card number (e.g. 4242 4242 4242 4242).' });
    if (!/^\d{2}$/.test(String(expMonth))) errors.push({ msg: 'Invalid expiry month.' });
    if (!/^\d{2,4}$/.test(String(expYear))) errors.push({ msg: 'Invalid expiry year.' });
    if (!/^\d{3,4}$/.test(String(cvv))) errors.push({ msg: 'Invalid CVV.' });

    if (errors.length) {
      return res.status(400).render('checkout/card', {
        cart,
        totals,
        shippingMethods: SHIPPING_METHODS,
        selectedShipping: shippingMethod,
        errors,
        values: req.body
      });
    }

    // Resolve default shipping address (if logged in)
    const userId = req.session?.user?._id || null;
    let shippingAddress = null;
    if (userId) {
      const me = await Customer.findById(userId).lean();
      const addr = (me?.addresses || []).find(a => a.isDefault) || (me?.addresses || [])[0];
      if (addr) {
        shippingAddress = {
          firstName: addr.firstName,
          lastName:  addr.lastName,
          line1:     addr.line1,
          line2:     addr.line2 || '',
          city:      addr.city,
          province:  addr.province || '',
          postalCode:addr.postalCode || '',
          country:   addr.country || 'TR',
          phone:     addr.phone || ''
        };
      }
    }

    // Validate items against DB (status/stock)
    const ids = cart.items.map(i => i.productId);
    const dbProducts = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } });
    const items = cart.items.map(i => {
      const p = dbProducts.find(d => String(d._id) === String(i.productId));
      if (!p || p.status !== 'Active') throw new Error(`${i.title} unavailable`);
      if (p.trackInventory && p.stockQty < i.qty) throw new Error(`Insufficient stock for ${p.title}`);
      return { productId: p._id, sku: p.sku, title: p.title, qty: i.qty, unitPrice: p.price };
    });

    // Create order as Paid (demo)
    const order = await Order.create({
      orderNo: 'ORD-' + Math.floor(Date.now() / 1000),
      customerId: userId,
      customerEmail: req.session?.user?.email || '',
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,        // keep the discount on the order
      shipping: totals.shipping,
      tax: totals.tax,
      grandTotal: totals.grandTotal,
      shippingAddress,
      status: 'Paid',
      paymentMethod: 'Card (Demo)',
      paymentStatus: 'Paid',
      timeline: [{ at: new Date(), status: 'Paid', note: 'Paid via Demo Card' }]
    });

    // Fire-and-forget confirmation email
    sendOrderConfirmation(order).catch(() => {});

    // Decrement stock
    await Promise.all(items.map(it =>
      Product.updateOne(
        { _id: it.productId, trackInventory: true },
        { $inc: { stockQty: -it.qty } }
      )
    ));

    // Clear cart/session checkout state and redirect
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
    delete req.session.checkout;

    res.redirect(`/account/orders/${order._id}`);
  } catch (e) { next(e); }
};
