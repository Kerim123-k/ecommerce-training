// src/controllers/order.controller.js
const crypto = require('crypto');
const Product = require('../models/Product');
const Order = require('../models/Order');
// const Customer = require('../models/Customer'); // uncomment if/when you use it

function orderNo() {
  return `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

// ---------- Customer checkout flow ----------
exports.checkoutForm = (req, res) => {
  const cart = req.session.cart || { items: [], subtotal: 0 };
  if (!cart.items.length) return res.redirect('/cart');
  res.render('checkout/index', { cart, errors: [], values: {} });
};

exports.checkout = async (req, res, next) => {
  try {
    const cart = req.session.cart || { items: [], subtotal: 0 };
    if (!cart.items.length) return res.redirect('/cart');

    // Stock & availability check
    const ids = cart.items.map(i => i.productId);
    const dbProducts = await Product.find({ _id: { $in: ids } });
    for (const i of cart.items) {
      const p = dbProducts.find(dp => String(dp._id) === String(i.productId));
      if (!p || p.status !== 'Active') {
        return res.status(400).render('checkout/index', {
          cart, errors: [{ msg: `${i.title} unavailable` }], values: req.body
        });
      }
      if (p.trackInventory && p.stockQty < i.qty) {
        return res.status(400).render('checkout/index', {
          cart, errors: [{ msg: `Not enough stock for ${i.title}` }], values: req.body
        });
      }
    }

    // Build order
    const shippingAddress = {
      firstName: req.body.firstName, lastName: req.body.lastName,
      line1: req.body.line1, line2: req.body.line2 || '',
      city: req.body.city, province: req.body.province || '',
      postalCode: req.body.postalCode || '', country: req.body.country || 'TR',
      phone: req.body.phone || ''
    };
    const subtotal = cart.subtotal;
    const shipping = 0, tax = 0;
    const grandTotal = Number((subtotal + shipping + tax).toFixed(2));
    const custId = req.session.user?._id || null;
    const custEmail = req.session.user?.email || req.body.email;

    const order = await Order.create({
      orderNo: orderNo(),
      customerId: custId, customerEmail: custEmail,
      items: cart.items,
      subtotal, shipping, tax, grandTotal,
      shippingAddress,
      status: 'Paid',
      paymentMethod: 'Mock',
      paymentStatus: 'Paid'
    });

    // Decrement stock
    await Promise.all(cart.items.map(i =>
      Product.updateOne(
        { _id: i.productId, trackInventory: true },
        { $inc: { stockQty: -i.qty } }
      )
    ));

    // Clear cart
    req.session.cart = { items: [], itemCount: 0, subtotal: 0 };

    res.redirect(`/order/${order._id}/thank-you`);
  } catch (e) { next(e); }
};

exports.thankYou = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');
    res.render('orders/thankyou', { order });
  } catch (e) { next(e); }
};

// ---------- Admin: list & detail/actions ----------
exports.adminList = async (req, res, next) => {
  try {
    const { q = '', status = '', page = 1 } = req.query;
    const limit = 20;
    const match = {};
    if (q) match.$or = [
      { orderNo: new RegExp(q, 'i') },
      { customerEmail: new RegExp(q, 'i') }
    ];
    if (status) match.status = status;

    const [orders, total] = await Promise.all([
      Order.find(match).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Order.countDocuments(match)
    ]);

    res.render('orders/admin_index', {
      orders,
      q, status,
      page: Number(page),
      pages: Math.ceil(total / limit)
    });
  } catch (e) { next(e); }
};


function pushTimeline(order, status, note = '') {
  order.timeline = order.timeline || [];
  order.timeline.push({ status, note, at: new Date() });
}

exports.adminShow = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');
    res.render('orders/admin_show', { order });
  } catch (e) { next(e); }
};

exports.adminProcess = async (req, res, next) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Cancelled', 'Shipped', 'Delivered'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    o.status = 'Processing';
    pushTimeline(o, 'Processing', 'Moved to processing');
    await o.save();
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
};

exports.adminShip = async (req, res, next) => {
  try {
    const { carrier, trackingNumber } = req.body;
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Cancelled', 'Delivered'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    o.tracking = { carrier: carrier || '', number: trackingNumber || '' };
    o.status = 'Shipped';
    pushTimeline(o, 'Shipped', `Carrier: ${carrier || '-'}, Tracking: ${trackingNumber || '-'}`);
    await o.save();
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
};

exports.adminDeliver = async (req, res, next) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Cancelled', 'Delivered'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    o.status = 'Delivered';
    pushTimeline(o, 'Delivered', 'Delivered to customer');
    await o.save();
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
};

exports.adminCancel = async (req, res, next) => {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    // restore stock
    await Promise.all(o.items.map(i =>
      Product.updateOne(
        { _id: i.productId, trackInventory: true },
        { $inc: { stockQty: i.qty } }
      )
    ));
    o.status = 'Cancelled';
    o.paymentStatus = 'Refunded'; // mock
    pushTimeline(o, 'Cancelled', 'Cancelled by admin; stock restored; payment refunded (mock)');
    await o.save();
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
};
