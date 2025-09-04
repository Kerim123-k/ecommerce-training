// src/controllers/cart.controller.js
'use strict';

const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Customer = require('../models/Customer');
const Order    = require('../models/Order');
const Coupon   = require('../models/Coupon');
const { calcTotals, shippingMethods } = require('../lib/totals');

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function getCart(req) {
  if (!req.session.cart) req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  return req.session.cart;
}

function recalc(cart) {
  cart.itemCount = cart.items.reduce((n, i) => n + Number(i.qty || 0), 0);
  cart.subtotal = Number(
    cart.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unitPrice || 0), 0).toFixed(2)
  );
}

function pickThumb(p) {
  let img = (Array.isArray(p.images) && p.images[0]) || p.image || '';
  if (!img) return img;
  if (img.startsWith('//')) img = 'https:' + img;
  if (img.startsWith('http://')) img = img.replace(/^http:\/\//, 'https://');
  return img;
}

function clampToStock(p, requestedQty) {
  const want = Math.max(0, parseInt(requestedQty, 10) || 0);
  if (p.trackInventory === false) return want;
  const stock = Math.max(0, Number(p.stockQty || 0));
  return Math.min(want, stock);
}

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isActiveWindow(c) {
  const now = new Date();

  if (c?.startsAt) {
    const start = new Date(c.startsAt);
    if (!isNaN(start) && now < start) return false;
  }
  if (c?.endsAt) {
    const end = new Date(c.endsAt);
    if (!isNaN(end)) {
      // Make date-only values inclusive (treat as end-of-day)
      const looksLikeMidnight =
        end.getHours() === 0 &&
        end.getMinutes() === 0 &&
        end.getSeconds() === 0 &&
        end.getMilliseconds() === 0;
      if (looksLikeMidnight) {
        end.setDate(end.getDate() + 1);
        end.setMilliseconds(end.getMilliseconds() - 1);
      }
      if (now > end) return false;
    }
  }
  return true;
}

function computeDiscount(subtotal, couponDocOrState) {
  const kindRaw  = (couponDocOrState.kind || couponDocOrState.type || 'amount').toLowerCase();
  const valueRaw = couponDocOrState.value ?? couponDocOrState.amount ?? 0;
  const value    = Number(valueRaw || 0);
  if (subtotal <= 0 || value <= 0) return 0;

  if (kindRaw === 'percent' || kindRaw === 'percentage') {
    const pct = Math.max(0, Math.min(100, value));
    return Number((subtotal * (pct / 100)).toFixed(2));
  }
  return Math.min(subtotal, Number(value.toFixed(2)));
}

/* ------------------------------------------------------------------ */
/* View cart                                                          */
/* ------------------------------------------------------------------ */
async function view(req, res, next) {
  try {
    const cart = getCart(req);

    if (!cart.items.length) {
      return res.render('cart/index', {
        cart,
        items: [],
        totals: { subTotal: cart.subtotal || 0 },
        flash: null
      });
    }

    const ids = cart.items.map(i => i.productId);
    const db = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .select('_id slug status trackInventory stockQty images')
      .lean();

    const map = new Map(db.map(p => [String(p._id), p]));
    let removed = 0, clamped = false;

    cart.items = cart.items.filter(it => {
      const p = map.get(String(it.productId));
      if (!p || p.status !== 'Active') { removed++; return false; }

      const max = p.trackInventory === false
        ? Infinity
        : Math.max(0, Number(p.stockQty || 0));

      if (it.qty > max) { it.qty = max; clamped = true; }

      it.image = it.image || pickThumb(p);
      it.href  = (p.slug && String(p.slug).trim())
        ? '/p/' + p.slug
        : '/products/id/' + p._id;

      return it.qty > 0;
    });

    recalc(cart);

    if (removed || clamped) {
      req.session.flash =
        removed && clamped
          ? `We updated your cart based on stock and removed ${removed} unavailable item${removed > 1 ? 's' : ''}.`
          : removed
          ? `Removed ${removed} unavailable item${removed > 1 ? 's' : ''} from your cart.`
          : 'Updated quantities based on current stock.';
    }

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('cart/index', {
      cart,
      items: cart.items,
      totals: { subTotal: cart.subtotal || 0 },
      flash
    });
  } catch (e) { next(e); }
}

/* ------------------------------------------------------------------ */
/* Add item                                                           */
/* ------------------------------------------------------------------ */
async function add(req, res, next) {
  try {
    const { id } = req.params;
    const requested = Math.max(1, parseInt(req.body.qty || '1', 10));

    const p = await Product.findById(id).lean();
    if (!p || p.status !== 'Active') return res.status(404).send('Product not available');

    const cart = getCart(req);

    let line = cart.items.find(i => String(i.productId) === String(p._id));
    if (!line) {
      line = {
        productId: p._id,
        title: p.title,
        sku: p.sku,
        qty: 0,
        unitPrice: Number(p.price || 0),
        image: pickThumb(p)
      };
      cart.items.push(line);
    }

    const newQty  = line.qty + requested;
    const clamped = clampToStock(p, newQty);
    line.qty      = clamped;

    req.session.flash =
      clamped < newQty
        ? `Limited "${p.title}" to ${clamped} due to stock.`
        : `Added "${p.title}" to your cart.`;

    recalc(cart);
    res.redirect('/cart');
  } catch (e) { next(e); }
}

/* ------------------------------------------------------------------ */
/* Update quantities                                                  */
/* ------------------------------------------------------------------ */
async function update(req, res, next) {
  try {
    const cart = getCart(req);
    if (!cart.items.length) return res.redirect('/cart');

    const form = req.body || {};
    let payload = [];

    if (form.removeId) {
      payload = [{ id: String(form.removeId).trim(), qty: 0 }];
    } else if (Array.isArray(form.items)) {
      payload = form.items.map(x => ({
        id: String((x && (x.id || x._id || x.productId)) || '').trim(),
        qty: x ? x.qty : 0
      }));
    } else {
      payload = [{ id: form.id, qty: form.qty }];
    }

    payload = payload.filter(x => x && x.id);

    const ids = [
      ...new Set(
        payload
          .flatMap(x => Array.isArray(x.id) ? x.id : [x.id])
          .map(id => String(id).trim())
          .filter(Boolean)
      ),
    ];

    const db  = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } })
      .select('_id title status trackInventory stockQty')
      .lean();
    const map = new Map(db.map(p => [String(p._id), p]));

    let removed = 0, clamped = false;

    for (const u of payload) {
      const id   = String(Array.isArray(u.id) ? u.id[0] : u.id);
      const line = cart.items.find(i => String(i.productId) === id);
      if (!line) continue;

      const p = map.get(id);
      if (!p || p.status !== 'Active') {
        line.qty = 0; removed++; continue;
      }

      const desired = Math.max(0, parseInt(u.qty, 10) || 0);
      const capped  = clampToStock(p, desired);
      if (capped !== desired) clamped = true;
      line.qty = capped;
    }

    cart.items = cart.items.filter(i => i.qty > 0);
    recalc(cart);

    req.session.flash =
      removed || clamped
        ? (removed && clamped
            ? `Updated cart (some quantities reduced and ${removed} unavailable item${removed > 1 ? 's' : ''} removed).`
            : removed
            ? `Removed ${removed} unavailable item${removed > 1 ? 's' : ''}.`
            : 'Updated quantities based on stock.')
        : 'Cart updated.';

    res.redirect('/cart');
  } catch (e) { next(e); }
}

/* ------------------------------------------------------------------ */
/* Clear cart                                                         */
/* ------------------------------------------------------------------ */
function clear(req, res) {
  req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  res.redirect('/cart');
}

/* ------------------------------------------------------------------ */
/* Checkout (GET)                                                     */
/* ------------------------------------------------------------------ */
async function showCheckout(req, res, next) {
  try {
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId).lean();
    const addresses = me?.addresses || [];

    const cart = getCart(req);
    const selectedShipping = req.query.method || req.query.shippingMethod || 'standard';

    const couponState = req.session.checkout?.coupon || null;
    const totals = calcTotals(cart, selectedShipping, couponState);

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('checkout/index', {
      addresses,
      cart,
      totals,
      shippingMethods,
      selectedShipping,
      appliedCoupon: couponState,
      flash
    });
  } catch (e) { next(e); }
}

/* ------------------------------------------------------------------ */
/* Coupon: apply/remove                                               */
/* ------------------------------------------------------------------ */
// in src/controllers/cart.controller.js
async function applyCoupon(req, res, next) {
  try {
    const cart = getCart(req);
    if (!cart.items.length) return res.redirect('/cart');

    const method  = req.body.shippingMethod || req.query.method || 'standard';
    const rawCode = String(req.body.coupon || '').trim();
    if (!rawCode) {
      req.session.flash = 'Please enter a coupon code.';
      return res.redirect('/checkout?method=' + encodeURIComponent(method));
    }

    const codeUpper = rawCode.toUpperCase();

    // Case/space-insensitive lookup: TRIM(DB.code) uppercased equals posted code uppercased
    let c = await Coupon.findOne({
      $expr: {
        $eq: [
          { $toUpper: { $trim: { input: "$code" } } },
          codeUpper
        ]
      }
    }).lean();

    if (!c) {
      req.session.flash = 'Invalid coupon code.';
      return res.redirect('/checkout?method=' + encodeURIComponent(method));
    }

    // active/status + time window
    const hasActiveFlag = (c.active !== undefined) ? !!c.active : true;
    const hasActiveText = (c.status !== undefined)
      ? String(c.status).trim().toLowerCase() === 'active'
      : true;

    const now = new Date();
    let inWindow = true;
    if (c.startsAt) inWindow = inWindow && now >= new Date(c.startsAt);
    if (c.endsAt) {
      const end = new Date(c.endsAt);
      // Treat date-only as inclusive end-of-day
      if (end.getHours() + end.getMinutes() + end.getSeconds() + end.getMilliseconds() === 0) {
        end.setDate(end.getDate() + 1); end.setMilliseconds(end.getMilliseconds() - 1);
      }
      inWindow = inWindow && now <= end;
    }

    if (!hasActiveFlag || !hasActiveText || !inWindow) {
      req.session.flash = 'Invalid coupon code.';
      return res.redirect('/checkout?method=' + encodeURIComponent(method));
    }

    const subtotal = cart.subtotal ?? cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const minReq   = Number(c.minSubtotal ?? c.min_subtotal ?? 0) || 0;
    if (minReq && subtotal < minReq) {
      req.session.flash = `Coupon requires a minimum subtotal of ₺ ${minReq.toFixed(2)}.`;
      return res.redirect('/checkout?method=' + encodeURIComponent(method));
    }

    const kind  = ((c.kind || c.type || 'amount').toLowerCase().startsWith('perc') ? 'percent' : 'amount');
    const value = Number(c.value ?? c.amount ?? 0);

    const discount = (kind === 'percent')
      ? Number((subtotal * Math.max(0, Math.min(100, value)) / 100).toFixed(2))
      : Math.min(subtotal, Number(value.toFixed(2)));

    if (discount <= 0) {
      req.session.flash = 'Coupon does not apply to your cart.';
      return res.redirect('/checkout?method=' + encodeURIComponent(method));
    }

    req.session.checkout = req.session.checkout || {};
    req.session.checkout.coupon = {
      code: (c.code || rawCode).toUpperCase(),
      kind,
      value,
      minSubtotal: minReq
    };

    req.session.flash = `Coupon ${(c.code || rawCode).toUpperCase()} applied.`;
    res.redirect('/checkout?method=' + encodeURIComponent(method));
  } catch (e) { next(e); }
}



function removeCoupon(req, res) {
  const method = req.body.shippingMethod || 'standard';
  if (req.session.checkout) delete req.session.checkout.coupon;
  req.session.flash = 'Coupon removed.';
  res.redirect('/checkout?method=' + encodeURIComponent(method));
}

/* ------------------------------------------------------------------ */
/* Place order (POST)                                                 */
/* ------------------------------------------------------------------ */
async function placeOrder(req, res, next) {
  try {
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    // 1) Address
    const selectedId = String(req.body.addressId || '');
    let shipAddr = (me.addresses || []).find(a => String(a._id) === selectedId)
                || (me.addresses || []).find(a => a.isDefault)
                || (me.addresses || [])[0];
    if (!shipAddr) return res.redirect('/account/addresses/new');

    const shippingAddress = {
      fullName:   shipAddr.fullName || [shipAddr.firstName, shipAddr.lastName].filter(Boolean).join(' ').trim(),
      phone:      shipAddr.phone || '',
      line1:      shipAddr.line1,
      line2:      shipAddr.line2 || '',
      city:       shipAddr.city,
      postalCode: shipAddr.postalCode,
      country:    shipAddr.country || 'TR',
    };

    // 2) Items
    const cart = req.session.cart || { items: [] };
    if (!cart.items.length) return res.redirect('/cart');

    const ids = cart.items.map(i => i.productId);
    const dbProducts = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } });
    const items = cart.items.map(i => {
      const p = dbProducts.find(d => String(d._id) === String(i.productId));
      if (!p || p.status !== 'Active') throw new Error(`${i.title} unavailable`);
      if (p.trackInventory && p.stockQty < i.qty) throw new Error(`Insufficient stock for ${p.title}`);
      return { productId: p._id, sku: p.sku, title: p.title, qty: i.qty, unitPrice: p.price };
    });

    // 3) Totals (with coupon)
    const shippingMethod = req.body.shippingMethod || 'standard';
    const couponState = req.session.checkout?.coupon || null;
    const totals = calcTotals({ items }, shippingMethod, couponState);

    // 4) Payment method
    const pm = (req.body.paymentMethod || 'bank').toLowerCase();
    let status = 'New';
    let paymentStatus = 'Pending';
    let paymentMethod = 'BankTransfer';
    if (pm === 'cod') { status = 'Processing'; paymentMethod = 'CashOnDelivery'; }

    // 5) Create order
    const order = await Order.create({
      orderNo: 'ORD-' + Math.floor(Date.now() / 1000),
      customerId: userId,
      customerEmail: me.email,
      items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      tax: totals.tax,
      discount: totals.discount || 0,
      grandTotal: totals.grandTotal,
      shippingAddress,
      status,
      paymentMethod,
      paymentStatus,
      timeline: [{ status, note: `Created via ${paymentMethod}`, at: new Date() }],
    });

    // 6) Clear cart & show bank details (if bank)
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
    if (req.session.checkout) delete req.session.checkout.coupon;

    if (paymentMethod === 'BankTransfer') {
      req.session.bankInfo = {
        bankName: process.env.BANK_NAME || 'Türkiye İş Bankası A.Ş.',
        accountName: process.env.BANK_ACCOUNT_NAME || 'Acme Teknoloji A.Ş.',
        iban: process.env.BANK_IBAN || 'TR33 0006 1005 1978 6457 8413 26',
        bic: process.env.BANK_BIC || 'ISBKTRIS',
        reference: order.orderNo
      };
    }
    res.redirect('/checkout/thankyou');
  } catch (e) { next(e); }
}

/* ------------------------------------------------------------------ */
/* Thank you (bank transfer)                                          */
/* ------------------------------------------------------------------ */
function thankyou(req, res) {
  const bankInfo = req.session.bankInfo || null;
  delete req.session.bankInfo;
  res.render('checkout/thankyou', { bankInfo });
}

/* ------------------------------------------------------------------ */
/* Exports                                                            */
/* ------------------------------------------------------------------ */
module.exports = {
  view,
  add,
  update,
  clear,
  showCheckout,
  applyCoupon,
  removeCoupon,
  placeOrder,
  thankyou,
};
