// src/controllers/cart.controller.js
const Product  = require('../models/Product');
const Customer = require('../models/Customer');
const Order    = require('../models/Order');

function getCart(req){
  if (!req.session.cart) req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  return req.session.cart;
}
function recalc(cart){
  cart.itemCount = cart.items.reduce((n,i)=>n+i.qty,0);
  cart.subtotal  = Number(cart.items.reduce((s,i)=>s+i.qty*i.unitPrice,0).toFixed(2));
}

exports.view = (req,res) => {
  const cart = getCart(req);
  res.render('cart/index', { cart });
};

exports.add = async (req,res,next) => {
  try {
    const { id } = req.params;
    const qty = Math.max(1, parseInt(req.body.qty || '1',10));
    const p = await Product.findById(id);
    if (!p || p.status !== 'Active') return res.status(404).send('Product not available');

    const cart = getCart(req);
    const existing = cart.items.find(i => String(i.productId) === String(p._id));
    if (existing) existing.qty += qty;
    else cart.items.push({
      productId: p._id, title: p.title, sku: p.sku, qty,
      unitPrice: p.price, image: (p.images && p.images[0]) || ''
    });
    recalc(cart);
    res.redirect('/cart');
  } catch (e) { next(e); }
};

exports.update = (req,res) => {
  const cart = getCart(req);
  const updates = Array.isArray(req.body.items) ? req.body.items : [{ id: req.body.id, qty: req.body.qty }];
  updates.forEach(u => {
    const it = cart.items.find(i => String(i.productId) === String(u.id));
    if (it) it.qty = Math.max(0, parseInt(u.qty,10) || 0);
  });
  cart.items = cart.items.filter(i => i.qty > 0);
  recalc(cart);
  res.redirect('/cart');
};

exports.clear = (req,res) => {
  req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
  res.redirect('/cart');
};

// ---------- CHECKOUT (GET) ----------
exports.showCheckout = async (req, res, next) => {
  try {
    const userId = (req.session?.user && req.session.user._id) || req.session?.userId || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId).lean();
    const addresses = me?.addresses || [];

    const cart = getCart(req);
    res.render('checkout/index', { addresses, cart, subTotal: cart.subtotal });
  } catch (e) { next(e); }
};

// ---------- PLACE ORDER (POST) ----------
exports.placeOrder = async (req, res, next) => {
  try {
    const userId = (req.session?.user && req.session.user._id) || req.session?.userId || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    // 1) Resolve address (selected or default)
    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    const selectedId = req.body.addressId;
    let shipAddr = me.addresses?.find(a => String(a._id) === String(selectedId));
    if (!shipAddr) shipAddr = me.addresses?.find(a => a.isDefault) || me.addresses?.[0];
    if (!shipAddr) return res.redirect('/account/addresses/new');

    const shippingAddress = {
      fullName:   shipAddr.fullName,
      phone:      shipAddr.phone,
      line1:      shipAddr.line1,
      line2:      shipAddr.line2,
      city:       shipAddr.city,
      postalCode: shipAddr.postalCode,
      country:    shipAddr.country,
    };

    // 2) Build order items from session cart
    const cart = getCart(req);
    if (!cart.items.length) return res.redirect('/cart');

    const ids = cart.items.map(i => i.productId);
    const dbProducts = await Product.find({ _id: { $in: ids }, isDeleted: { $ne: true } });

    const items = cart.items.map(i => {
      const p = dbProducts.find(d => String(d._id) === String(i.productId));
      if (!p) throw new Error('Product not found during checkout');
      if (p.stockQty < i.qty) throw new Error(`Insufficient stock for ${p.title}`);
      return { productId: p._id, sku: p.sku, title: p.title, qty: i.qty, unitPrice: p.price };
    });

    const subTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);

    // 3) Create order (includes address snapshot)
    const orderNo = 'ORD-' + Math.floor(Date.now() / 1000);
    await Order.create({
      orderNo,
      customerId: userId,
      customerEmail: me.email,
      items,
      totals: { subTotal, grandTotal: subTotal },
      shippingAddress,
      status: 'Paid',
      payment: { method: 'Mock', txnId: 'demo' }
    });

    // 4) Decrement stock
    for (const it of items) {
      await Product.updateOne({ _id: it.productId }, { $inc: { stockQty: -it.qty } });
    }

    // 5) Clear cart and thank-you
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
    res.redirect('/checkout/thankyou');
  } catch (e) { next(e); }
};
