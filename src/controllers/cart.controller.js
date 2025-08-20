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
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId).lean();
    const addresses = me?.addresses || [];

    const cart = getCart(req);
    res.render('checkout/index', { addresses, cart, subTotal: cart.subtotal });
  } catch (e) { next(e); }
};

// ---------- PLACE ORDER (POST) ----------
// src/controllers/cart.controller.js
exports.placeOrder = async (req, res, next) => {
  try {
    const userId = req.session?.user?._id || req.user?._id;
    if (!userId) return res.redirect('/auth/login');

    const me = await Customer.findById(userId);
    if (!me) return res.redirect('/auth/login');

    // 1) Resolve shipping address (selected > default > first)
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

    // 2) Build order items from the session cart
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

    const subtotal = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
    const grandTotal = Number(subtotal.toFixed(2)); // shipping/tax=0 for now

    // 3) Create order (NOTE: root-level subtotal & grandTotal)
    await Order.create({
      orderNo: 'ORD-' + Math.floor(Date.now() / 1000),
      customerId: userId,
      customerEmail: me.email,
      items,
      subtotal: grandTotal,   // or use `subtotal` if you prefer raw sum
      grandTotal,
      shippingAddress,
      status: 'Paid',
      paymentMethod: 'Mock',
      paymentStatus: 'Paid',
    });

    // 4) Decrement stock
    await Promise.all(items.map(it =>
      Product.updateOne(
        { _id: it.productId, trackInventory: true },
        { $inc: { stockQty: -it.qty } }
      )
    ));

    // 5) Clear cart & redirect
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };
    res.redirect('/checkout/thankyou');
  } catch (e) { next(e); }
};

exports.thankyou = (_req, res) => {
  res.render('checkout/thankyou');
};

