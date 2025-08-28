// src/services/orderEmails.js
const nodemailer = require('nodemailer');

const FROM_EMAIL = process.env.FROM_EMAIL || 'no-reply@example.com';
const FROM_NAME  = process.env.FROM_NAME  || 'My Shop';
const ADMIN_BCC  = process.env.ADMIN_NOTIFY_EMAIL || '';

/** Build a Nodemailer transport from env (Gmail SMTP / any SMTP) */
function buildTransport() {
  const driver = (process.env.EMAIL_DRIVER || 'smtp').toLowerCase();

  if (driver === 'smtp') {
    const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Fallback: JSON transport (logs emails to console)
  return nodemailer.createTransport({ jsonTransport: true });
}

const transport = buildTransport();

/** Shared helpers */
function fmtMoney(n) {
  return `₺ ${Number(n || 0).toFixed(2)}`;
}

function itemsTable(items = []) {
  const rows = items.map(i => {
    const unit = Number(i.unitPrice || 0);
    const qty  = Number(i.qty || 1);
    const line = unit * qty;
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.title || '-'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;">${i.sku || '-'}</td>
        <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">${qty}</td>
        <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">${fmtMoney(unit)}</td>
        <td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;">${fmtMoney(line)}</td>
      </tr>`;
  }).join('');

  return `
    <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:14px;">
      <thead>
        <tr>
          <th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd;">Product</th>
          <th align="left" style="padding:6px 8px;border-bottom:2px solid #ddd;">SKU</th>
          <th align="right" style="padding:6px 8px;border-bottom:2px solid #ddd;">Qty</th>
          <th align="right" style="padding:6px 8px;border-bottom:2px solid #ddd;">Unit</th>
          <th align="right" style="padding:6px 8px;border-bottom:2px solid #ddd;">Line</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function totalsBlock(o) {
  // support both old & new schemas
  const subtotal = Number(o.subtotal ?? (o.totals && o.totals.subTotal) ?? 0);
  const tax      = Number(o.tax      ?? (o.totals && o.totals.tax)      ?? 0);
  const shipping = Number(o.shipping ?? (o.totals && (o.totals.shipping ?? o.totals.shippingCost)) ?? 0);
  const grand    = Number(o.grandTotal ?? (o.totals && o.totals.grandTotal) ?? (subtotal + tax + shipping));
  return `
    <div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;">
      <div>Subtotal: <strong>${fmtMoney(subtotal)}</strong></div>
      <div>Tax: <strong>${fmtMoney(tax)}</strong></div>
      <div>Shipping: <strong>${fmtMoney(shipping)}</strong></div>
      <div style="margin-top:6px;font-size:16px;">Total: <strong>${fmtMoney(grand)}</strong></div>
    </div>`;
}

function addressBlock(a = {}) {
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ').trim() || a.fullName || '';
  const line2 = a.line2 ? `<br>${a.line2}` : '';
  const city = [a.city, a.province, a.postalCode].filter(Boolean).join(', ');
  const phone = a.phone ? `<div style="color:#666;">📞 ${a.phone}</div>` : '';
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;">
      <div><strong>${name}</strong></div>
      <div>${a.line1 || ''}${line2}</div>
      <div>${city}</div>
      <div>${a.country || ''}</div>
      ${phone}
    </div>`;
}

/** Send order confirmation to the customer (to = order.customerEmail) */
async function sendOrderConfirmation(order) {
  const toEmail = (order.customerEmail || '').trim();
  if (!toEmail) return; // no recipient, silently skip

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;">
      <h2>Thanks for your order ${order.orderNo || ''}!</h2>
      <p>We’ve received your order and will notify you as it progresses.</p>
      ${itemsTable(order.items)}
      ${totalsBlock(order)}
      <h3 style="margin-top:14px;">Shipping address</h3>
      ${addressBlock(order.shippingAddress)}
    </div>
  `;

  await transport.sendMail({
    to: toEmail,
    bcc: ADMIN_BCC || undefined, // optional admin copy
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    subject: `Order confirmation ${order.orderNo || ''}`,
    html
  });
}

/** Send a status update (Processing/Shipped/Delivered/Cancelled/Paid) */
async function sendOrderStatus(order, label = 'Updated') {
  const toEmail = (order.customerEmail || '').trim();
  if (!toEmail) return;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;">
      <h2>Your order ${order.orderNo || ''} is now: ${label}</h2>
      <p>Current status: <strong>${order.status}</strong></p>
      ${order.tracking && (order.tracking.carrier || order.tracking.number)
        ? `<p>Tracking: ${order.tracking.carrier || '-'} ${order.tracking.number || ''}</p>` : ''}
      ${itemsTable(order.items)}
      ${totalsBlock(order)}
    </div>
  `;

  await transport.sendMail({
    to: toEmail,
    bcc: ADMIN_BCC || undefined,
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    subject: `Order ${order.orderNo || ''}: ${label}`,
    html
  });
}

module.exports = {
  sendOrderConfirmation,
  sendOrderStatus,
};
