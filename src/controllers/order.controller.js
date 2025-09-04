// src/controllers/order.controller.js
const crypto   = require('crypto');
const path     = require('path');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const Customer = require('../models/Customer');
const { renderInvoice } = require('../services/invoicePdf');

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

// Find the last Delivered timestamp from the timeline (if any)
function getDeliveredAt(order) {
  const tl = Array.isArray(order.timeline) ? order.timeline : [];
  for (let i = tl.length - 1; i >= 0; i--) {
    if (tl[i] && tl[i].status === 'Delivered' && tl[i].at) {
      return new Date(tl[i].at);
    }
  }
  return null;
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

    // For totals rendering compatibility
    const total =
      (o.totals && (o.totals.grandTotal ?? o.totals.subTotal)) ??
      o.grandTotal ?? o.subtotal ?? 0;

    // Compute request eligibility flags for the UI
    const status = o.status || 'New';
    const isTerminal = ['Cancelled'].includes(status);
    const isShippedOrLater = ['Shipped', 'Delivered', 'Cancelled'].includes(status);

    const cancelEligible = !isShippedOrLater && !o.cancelRequestedAt && !isTerminal;

    const deliveredAt = getDeliveredAt(o);
    const returnWindowDays = Number(process.env.RETURN_WINDOW_DAYS || 14);
    const withinReturnWindow =
      !!deliveredAt &&
      (Date.now() - deliveredAt.getTime()) <= returnWindowDays * 24 * 60 * 60 * 1000;

    const returnEligible =
      (status === 'Delivered') &&
      withinReturnWindow &&
      !o.returnRequestedAt &&
      (o.returnStatus !== 'Approved');

    res.render('account/orders/show', {
      order: o,
      normalizedTotal: Number(total),
      cancelEligible,
      returnEligible,
      returnWindowDays,
      deliveredAt
    });
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
   Customer: request Cancel / Return
   ========================= */

// POST /account/orders/:id/cancel-request
async function requestCancel(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const o = await Order.findOne({ _id: req.params.id, customerId: uid });
    if (!o) return res.status(404).send('Order not found');

    if (['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) {
      req.session.flash = 'This order can no longer be cancelled.';
      return res.redirect(`/account/orders/${o._id}`);
    }
    if (o.cancelRequestedAt) {
      req.session.flash = 'Cancellation already requested.';
      return res.redirect(`/account/orders/${o._id}`);
    }

    const reason = String(req.body.reason || '').trim();
    o.cancelRequestedAt = new Date();
    if (reason) o.cancelReason = reason;

    o.timeline = o.timeline || [];
    o.timeline.push({ status: 'Cancel Requested', note: reason || '', at: new Date() });

    await o.save();
    sendOrderStatus(o, 'Cancel Requested').catch(() => {});
    req.session.flash = 'Your cancellation request was submitted.';
    res.redirect(`/account/orders/${o._id}`);
  } catch (e) { next(e); }
}

// POST /account/orders/:id/return-request
async function requestReturn(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const o = await Order.findOne({ _id: req.params.id, customerId: uid });
    if (!o) return res.status(404).send('Order not found');

    const deliveredAt = getDeliveredAt(o);
    const returnWindowDays = Number(process.env.RETURN_WINDOW_DAYS || 14);

    if (o.status !== 'Delivered' || !deliveredAt) {
      req.session.flash = 'You can only request a return after delivery.';
      return res.redirect(`/account/orders/${o._id}`);
    }
    const withinWindow =
      (Date.now() - deliveredAt.getTime()) <= returnWindowDays * 24 * 60 * 60 * 1000;
    if (!withinWindow) {
      req.session.flash = `Return window (${returnWindowDays} days) has passed.`;
      return res.redirect(`/account/orders/${o._id}`);
    }
    if (o.returnRequestedAt || o.returnStatus === 'Approved') {
      req.session.flash = 'A return request already exists for this order.';
      return res.redirect(`/account/orders/${o._id}`);
    }

    const reason = String(req.body.reason || '').trim();
    o.returnRequestedAt = new Date();
    if (reason) o.returnReason = reason;
    o.returnStatus = 'Requested';

    o.timeline = o.timeline || [];
    o.timeline.push({ status: 'Return Requested', note: reason || '', at: new Date() });

    await o.save();
    sendOrderStatus(o, 'Return Requested').catch(() => {});
    req.session.flash = 'Your return request was submitted.';
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

/* -------- Admin: Approve / Deny customer requests -------- */

// POST /admin/orders/:id/cancel-approve
async function adminCancelApprove(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');

    if (!o.cancelRequestedAt) {
      return res.redirect(`/admin/orders/${o._id}`);
    }
    if (['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) {
      return res.redirect(`/admin/orders/${o._id}`);
    }

    // Reuse cancel flow: restore stock, set status Cancelled
    await Promise.all(o.items.map(i =>
      Product.updateOne(
        { _id: i.productId, trackInventory: true },
        { $inc: { stockQty: i.qty } }
      )
    ));
    o.status = 'Cancelled';
    o.paymentStatus = 'Refunded'; // mock
    pushTimeline(o, 'Cancelled', 'Customer cancel request approved by admin');
    await o.save();

    sendOrderStatus(o, 'Cancelled').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

// POST /admin/orders/:id/cancel-deny
async function adminCancelDeny(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (!o.cancelRequestedAt) return res.redirect(`/admin/orders/${o._id}`);

    pushTimeline(o, 'Cancel Denied', String(req.body.note || ''));
    // keep original status
    await o.save();

    sendOrderStatus(o, 'Cancel Denied').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

// POST /admin/orders/:id/return-approve
async function adminReturnApprove(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (!o.returnRequestedAt) return res.redirect(`/admin/orders/${o._id}`);

    const rma = 'RMA-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    o.returnStatus = 'Approved';
    o.rmaCode = rma;
    pushTimeline(o, 'Return Approved', `RMA: ${rma}`);
    await o.save();

    sendOrderStatus(o, 'Return Approved').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

// POST /admin/orders/:id/return-deny
async function adminReturnDeny(req, res, next) {
  try {
    const o = await Order.findById(req.params.id);
    if (!o) return res.status(404).send('Order not found');
    if (!o.returnRequestedAt) return res.redirect(`/admin/orders/${o._id}`);

    o.returnStatus = 'Denied';
    pushTimeline(o, 'Return Denied', String(req.body.note || ''));
    await o.save();

    sendOrderStatus(o, 'Return Denied').catch(() => {});
    res.redirect(`/admin/orders/${o._id}`);
  } catch (e) { next(e); }
}

/* ---------------------- CSV Export (admin) ---------------------- */
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

/* ---------------------- Admin Dashboard ---------------------- */
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

/* ---------------------- Invoices ---------------------- */
async function invoiceMy(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const order = await Order.findOne({ _id: req.params.id, customerId: uid }).lean();
    if (!order) return res.status(404).send('Order not found');

    renderInvoice(res, order);
  } catch (e) { next(e); }
}

async function invoiceAdmin(req, res, next) {
  try {
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).send('Order not found');

    renderInvoice(res, order);
  } catch (e) { next(e); }
}
async function requestCancelMy(req, res, next) {
  try {
    const uid = req.session?.user?._id;
    if (!uid) return res.redirect('/auth/login');

    const o = await Order.findOne({ _id: req.params.id, customerId: uid });
    if (!o) return res.status(404).send('Order not found');

    // Only allow while not shipped/delivered/cancelled
    if (['Shipped', 'Delivered', 'Cancelled'].includes(o.status)) {
      req.session.flash = 'This order can no longer be cancelled.';
      return res.redirect(`/account/orders/${o._id}`);
    }

    const note = String(req.body.note || '').slice(0, 500);
    o.timeline = o.timeline || [];
    o.timeline.push({
      at: new Date(),
      status: 'Cancel Requested',
      note: note || 'Customer requested cancellation.',
    });

    await o.save();

    req.session.flash = 'We received your cancellation request.';
    res.redirect(`/account/orders/${o._id}`);
  } catch (e) { next(e); }
}

module.exports = {
  // customer
  myOrders,
  myOrderShow,
  uploadReceipt,
  requestCancel,
  requestReturn,

  // admin
  adminList,
  adminShow,
  adminProcess,
  adminShip,
  adminDeliver,
  adminCancel,
  adminExportCsv,
  adminDashboard,
  adminMarkPaid,
  adminCancelApprove,
  adminCancelDeny,
  adminReturnApprove,
  adminReturnDeny,

  // pdf
  invoiceMy,
  invoiceAdmin,
   requestCancelMy,
};
