// src/controllers/order.controller.js
const crypto   = require('crypto');
const path     = require('path');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const Customer = require('../models/Customer');

// ---- Email helpers (safe fallback if missing) ----
let sendOrderConfirmation = async () => {};
let sendOrderStatus = async () => {};
try {
  ({ sendOrderConfirmation, sendOrderStatus } = require('../services/orderEmails'));
} catch (e) {
  console.warn('[order.controller] orderEmails service not found; emails disabled.');
}

function makeOrderNo() {
  return `ORD-${Date.now()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/* =========================
   Customer: My Orders
   ========================= */
async function myOrders(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const orders = await Order.find({ customerId: uid })
      .sort({ createdAt: -1 })
      .lean();

    res.render('account/orders/index', { orders });
  } catch (e) { next(e); }
}

async function myOrderShow(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const o = await Order.findOne({ _id: req.params.id, customerId: uid }).lean();
    if (!o) return res.status(404).send('Order not found');

    const total =
      (o.totals && (o.totals.grandTotal ?? o.totals.subTotal)) ??
      o.grandTotal ?? o.subtotal ?? 0;

    res.render('account/orders/show', { order: o, normalizedTotal: Number(total) });
  } catch (e) { next(e); }
}

/* =========================
   Customer: upload receipt (bank transfer)
   ========================= */
async function uploadReceipt(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const o = await Order.findOne({ _id: req.params.id, customerId: uid });
    if (!o) return res.status(404).send('Order not found');

    if (!req.file || !req.file.path) {
      req.session.flash = 'No file uploaded.';
      return res.redirect(`/account/orders/${o._id}`);
    }
    const rel = req.file.path.split(path.sep + 'public' + path.sep)[1];
    const url = '/' + String(rel || '').replace(/\\/g, '/');

    o.timeline = o.timeline || [];
    o.timeline.push({
      at: new Date(),
      status: o.status || 'New',
      note: `Customer uploaded receipt: ${url}`
    });
    if (!o.paymentMethod) o.paymentMethod = 'Bank Transfer';
    if (!o.paymentStatus || o.paymentStatus === 'Pending') {
      o.paymentStatus = 'Pending';
    }
    await o.save();

    req.session.flash = 'Receipt uploaded. We will verify your payment shortly.';
    res.redirect(`/account/orders/${o._id}`);
  } catch (e) { next(e); }
}

/* =========================
   Admin: list/show/actions
   ========================= */
async function adminList(req, res, next) {
  try {
    const { q = '', status = '', page = 1, from = '', to = '' } = req.query;
    const limit = 10;
    const match = {};

    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      match.$or = [
        { orderNo: rx },
        { customerEmail: rx },
        { 'items.sku': rx },
        { 'items.title': rx },
      ];
    }
    if (status) match.status = status;

    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
        match.createdAt.$lt = end;
      }
    }

    const pg = Math.max(1, parseInt(page, 10) || 1);

    const [orders, total] = await Promise.all([
      Order.find(match)
        .sort({ createdAt: -1 })
        .skip((pg - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(match),
    ]);

    const pages = Math.max(1, Math.ceil(total / limit));

    res.render('orders/admin_index', {
      orders,
      q, status, from, to,
      page: pg,
      pages,
      total,
    });
  } catch (e) { next(e); }
}

async function adminShow(req, res, next) {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).send('Order not found');
    return res.render('orders/show', { order });
  } catch (e) { next(e); }
}

// Timeline helper
function pushTimeline(order, status, note = '') {
  order.timeline = order.timeline || [];
  order.timeline.push({ status, note, at: new Date() });
}

async function adminProcess(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Cancelled', 'Shipped', 'Delivered'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    o.status = 'Processing';
    pushTimeline(o, 'Processing', 'Moved to processing');
    await o.save();

    sendOrderStatus(o, 'Processing').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

async function adminShip(req, res, next) {
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

    sendOrderStatus(o, 'Shipped').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

async function adminDeliver(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Cancelled', 'Delivered'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    o.status = 'Delivered';
    pushTimeline(o, 'Delivered', 'Delivered to customer');
    await o.save();

    sendOrderStatus(o, 'Delivered').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

async function adminCancel(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
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

    sendOrderStatus(o, 'Cancelled').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

async function adminMarkPaid(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');

    o.paymentStatus = 'Paid';
    if (!o.paymentMethod) o.paymentMethod = 'Manual';
    if (o.status === 'New' || !o.status) o.status = 'Paid';
    pushTimeline(o, 'Paid', 'Marked paid by admin');
    await o.save();

    sendOrderStatus(o, 'Paid').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

async function adminExportCsv(req, res, next) {
  try {
    const { q = '', status = '', from = '', to = '' } = req.query;

    const match = {};
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(safe, 'i');
      match.$or = [
        { orderNo: rx },
        { customerEmail: rx },
        { 'items.sku': rx },
        { 'items.title': rx },
      ];
    }
    if (status) match.status = status;
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setDate(end.getDate() + 1);
        end.setHours(0, 0, 0, 0);
        match.createdAt.$lt = end;
      }
    }

    const orders = await Order.find(match).sort({ createdAt: -1 }).lean();

    const csvEsc = v => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = ['orderNo','createdAt','customerEmail','itemCount','grandTotal','status'];
    const lines = [header.join(',')];

    for (const o of orders) {
      const itemCount = (o.items || []).reduce((n, i) => n + (i.qty || 1), 0);
      const totalVal =
        (o.totals && (o.totals.grandTotal ?? o.totals.subTotal)) ??
        o.grandTotal ?? o.subtotal ?? 0;

      lines.push([
        csvEsc(o.orderNo || o._id),
        csvEsc(new Date(o.createdAt).toISOString()),
        csvEsc(o.customerEmail || ''),
        csvEsc(itemCount),
        csvEsc(Number(totalVal).toFixed(2)),
        csvEsc(o.status || '')
      ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    res.send(lines.join('\n'));
  } catch (e) { next(e); }
}

async function adminDashboard(_req, res, next) {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const readTotal = (o) =>
      (o.totals && (o.totals.grandTotal ?? o.totals.subTotal)) ??
      o.grandTotal ?? o.subtotal ?? 0;

    const todays = await Order.find({ createdAt: { $gte: todayStart, $lt: tomorrow } }).lean();
    const todayOrders = todays.length;
    const todayRevenue = todays.reduce((s, o) => s + Number(readTotal(o) || 0), 0);

    const statusAgg = await Order.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const statusCounts = Object.fromEntries(statusAgg.map(r => [r._id || 'Unknown', r.n]));

    const lowStock = await Product.find({
      status: 'Active',
      isDeleted: { $ne: true },
      stockQty: { $lte: 5 }
    })
      .sort({ stockQty: 1, createdAt: -1 })
      .limit(10)
      .lean();

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const topProducts = await Order.aggregate([
      { $match: { createdAt: { $gte: weekStart } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: { sku: '$items.sku', title: '$items.title' },
          qty: { $sum: '$items.qty' },
          revenue: { $sum: { $multiply: ['$items.qty', '$items.unitPrice'] } }
        }
      },
      { $sort: { qty: -1 } },
      { $limit: 5 }
    ]);

    res.render('admin/dashboard', {
      todayOrders,
      todayRevenue,
      statusCounts,
      lowStock,
      topProducts,
      weekStart
    });
  } catch (e) { next(e); }
}

module.exports = {
  myOrders,
  myOrderShow,
  uploadReceipt,
  adminList,
  adminShow,
  adminProcess,
  adminShip,
  adminDeliver,
  adminCancel,
  adminExportCsv,
  adminDashboard,
  adminMarkPaid,
};
