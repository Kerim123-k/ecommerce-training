// src/controllers/cart.controller.js
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Customer = require('../models/Customer');
const Coupon   = require('../models/Coupon'); // make sure this model exists
const { calcTotals, shippingMethods, pickShipping } = require('../lib/totals');

/* ---------------------------- helpers ---------------------------- */
function getCart(req) {
  if (!req.session.cart) req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  return req.session.cart;
}
function recalc(cart) {
  cart.itemCount = cart.items.reduce((n, i) => n + i.qty, 0);
  cart.subtotal  = Number(
    cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0).toFixed(2)
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

/* ----------------------------- view cart ----------------------------- */
exports.view = async (req, res, next) => {
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

      const max = p.trackInventory === false ? Infinity : Math.max(0, Number(p.stockQty || 0));
      if (it.qty > max) { it.qty = max; clamped = true; }

      it.image = it.image || pickThumb(p);
      it.href  = (p.slug && String(p.slug).trim()) ? '/p/' + p.slug : '/products/id/' + p._id;
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
};

/* ------------------------------ add item ------------------------------ */
exports.add = async (req, res, next) => {
  try {
    const { id } = req.params;
    const requested = Math.max(1, parseInt(req.body.qty || '1', 10));

    const p = await Product.findById(id).lean();
    if (!p || p.status !== 'Active') return res.status(404).send('Product not available');

    const cart = getCart(req);

    let line = cart.items.find(i => String(i.productId) === String(p._id));
    if (!line) {
      line = { productId: p._id, title: p.title, sku: p.sku, qty: 0, unitPrice: Number(p.price || 0), image: pickThumb(p) };
      cart.items.push(line);
    }

    const newQty   = line.qty + requested;
    const clamped  = clampToStock(p, newQty);
    line.qty       = clamped;

    req.session.flash = (clamped < newQty)
      ? `Limited "${p.title}" to ${clamped} due to stock.`
      : `Added "${p.title}" to your cart.`;

    recalc(cart);
    res.redirect('/cart');
  } catch (e) { next(e); }
};

/* ---------------------------- update quantities ---------------------------- */
exports.update = async (req, res, next) => {
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
    const ids = [...new Set(payload.flatMap(x => Array.isArray(x.id) ? x.id : [x.id]).map(String).filter(Boolean))];

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
      if (!p || p.status !== 'Active') { line.qty = 0; removed++; continue; }

      const desired = Math.max(0, parseInt(u.qty, 10) || 0);
      const capped  = clampToStock(p, desired);
      if (capped !== desired) clamped = true;
      line.qty = capped;
    }

    cart.items = cart.items.filter(i => i.qty > 0);
    recalc(cart);

    req.session.flash = removed || clamped
      ? (removed && clamped
        ? `Updated cart (some quantities reduced and ${removed} unavailable item${removed > 1 ? 's' : ''} removed).`
        : removed
          ? `Removed ${removed} unavailable item${removed > 1 ? 's' : ''}.`
          : 'Updated quantities based on stock.')
      : 'Cart updated.';

    res.redirect('/cart');
  } catch (e) { next(e); }
};

/* -------------------------------- clear -------------------------------- */
exports.clear = (req, res) => {
  req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  res.redirect('/cart');
};

/* ---------------------------- CHECKOUT (GET) ---------------------------- */
exports.showCheckout = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId).lean();
    const addresses = me?.addresses || [];

    const cart = getCart(req);
    const selectedShipping = req.query.method || req.session.checkout?.shippingMethod || 'standard';

    // read coupon stored in session
    const sessionCoupon = req.session.checkout?.coupon || null;

    const totals = calcTotals(cart, selectedShipping, sessionCoupon);

    // persist the selected shipping method
    req.session.checkout = req.session.checkout || {};
    req.session.checkout.shippingMethod = totals.shippingMethod;

    const flash = req.session.flash || null;
    delete req.session.flash;

    res.render('checkout/index', {
      addresses,
      cart,
      totals,
      shippingMethods,
      selectedShipping: totals.shippingMethod,
      appliedCoupon: sessionCoupon,
      flash
    });
  } catch (e) { next(e); }
};

/* ------------------------- COUPON: APPLY/REMOVE ------------------------- */
exports.applyCoupon = async (req, res, next) => {
  try {
    const cart = getCart(req);
    const code = String(req.body.coupon || '').trim().toUpperCase();
    if (!code) {
      req.session.flash = 'Please enter a coupon code.';
      return res.redirect('/checkout');
    }

    // validate coupon
    const now = new Date();
    const doc = await Coupon.findOne({
      code,
      status: 'Active',
      $or: [{ startsAt: { $lte: now } }, { startsAt: { $exists: false } }],
      $or2: [{ endsAt: { $gte: now } }, { endsAt: { $exists: false } }]
    }).lean();

    if (!doc) {
      req.session.flash = 'Invalid coupon code.';
      return res.redirect('/checkout');
    }

    // check subtotal requirement
    const subtotal = cart.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    if (Number(doc.minSubtotal || 0) > subtotal) {
      req.session.flash = `This coupon requires a minimum subtotal of ₺ ${Number(doc.minSubtotal).toFixed(2)}.`;
      return res.redirect('/checkout');
    }

    // store minimal fields in session
    req.session.checkout = req.session.checkout || {};
    req.session.checkout.coupon = {
      code: doc.code,
      kind: (doc.kind || doc.type || '').toLowerCase() === 'percent' ? 'percent' : 'amount',
      value: Number(doc.value || 0),
      maxDiscount: doc.maxDiscount ? Number(doc.maxDiscount) : undefined
    };

    req.session.flash = `Coupon ${doc.code} applied.`;
    res.redirect('/checkout');
  } catch (e) { next(e); }
};

exports.removeCoupon = (req, res) => {
  if (req.session.checkout) req.session.checkout.coupon = null;
  req.session.flash = 'Coupon removed.';
  res.redirect('/checkout');
};

/* --------------------------- PLACE ORDER (POST) -------------------------- */
exports.placeOrder = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

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

    // totals with session coupon & shipping
    const coupon = req.session.checkout?.coupon || null;
    const method = req.session.checkout?.shippingMethod || 'standard';
    const totals = calcTotals(cart, method, coupon);

    // create the order (unchanged business logic otherwise)
    const Order = require('../models/Order');
    const order = await Order.create({
      orderNo: 'ORD-' + Math.floor(Date.now() / 1000),
      customerId: userId,
      customerEmail: me.email,
      items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shippingCost,
      tax: totals.tax,
      grandTotal: totals.grandTotal,
      shippingAddress,
      status: 'New',
      paymentMethod: (req.body.paymentMethod || 'bank') === 'cod' ? 'CashOnDelivery' : 'BankTransfer',
      paymentStatus: 'Pending',
      coupon: coupon ? coupon.code : undefined,
      timeline: [{ status: 'New', note: 'Created via checkout', at: new Date() }],
    });

    // clear cart, leave session.checkout in place for thankyou if needed
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };

    // bank info for thankyou page (optional)
    if (order.paymentMethod === 'BankTransfer') {
      req.session.bankInfo = {
        bankName: process.env.BANK_NAME || '',
        accountName: process.env.BANK_ACCOUNT_NAME || '',
        iban: process.env.BANK_IBAN || '',
        bic: process.env.BANK_BIC || '',
        reference: order.orderNo
      };
    }

    res.redirect('/checkout/thankyou');
  } catch (e) { next(e); }
};

/* --------------------------- THANK YOU (GET) ---------------------------- */
exports.thankyou = (req, res) => {
  const bankInfo = req.session.bankInfo || null;
  delete req.session.bankInfo;
  res.render('checkout/thankyou', { bankInfo });
};
