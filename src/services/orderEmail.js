// src/services/orderEmails.js
const { sendMail } = require('./sendMail');

function currency(n) {
  return '₺ ' + Number(n || 0).toFixed(2);
}

function orderSummaryHtml(order) {
  const itemsHtml = (order.items || [])
    .map(i => `<tr>
      <td>${i.title}</td>
      <td align="right">${i.qty}</td>
      <td align="right">${currency(i.unitPrice)}</td>
      <td align="right">${currency((i.qty || 0) * (i.unitPrice || 0))}</td>
    </tr>`).join('');

  const subtotal = order.subtotal ?? order.totals?.subTotal ?? 0;
  const shipping = order.shipping ?? order.totals?.shipping ?? order.totals?.shippingCost ?? 0;
  const tax      = order.tax ?? order.totals?.tax ?? 0;
  const discount = order.discount || 0;
  const grand    = order.grandTotal ?? order.totals?.grandTotal ?? (subtotal - discount + shipping + tax);

  return `
    <h2>Order ${order.orderNo || order._id}</h2>
    <p>Thank you for your purchase! Here is a summary of your order.</p>
    <table width="100%" cellspacing="0" cellpadding="6" style="border-collapse:collapse;border:1px solid #eee">
      <thead>
        <tr style="background:#fafafa">
          <th align="left">Product</th>
          <th align="right">Qty</th>
          <th align="right">Unit</th>
          <th align="right">Line</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <p style="margin-top:12px">
      Subtotal: <strong>${currency(subtotal)}</strong><br/>
      ${discount ? `Discount: <strong>- ${currency(discount)}</strong><br/>` : ''}
      Shipping: ${currency(shipping)}<br/>
      Tax: ${currency(tax)}<br/>
      <span style="font-size:1.1rem">Total: <strong>${currency(grand)}</strong></span>
    </p>
  `;
}

function recipient(order) {
  return (order.customerEmail || '').trim() || process.env.ADMIN_EMAIL;
}

async function sendOrderConfirmation(order) {
  const to = recipient(order);
  if (!to) throw new Error('No recipient email for order confirmation');
  const subject = `Order ${order.orderNo || order._id} confirmed`;
  const html = orderSummaryHtml(order);
  const text = `Your order ${order.orderNo || order._id} is confirmed. Total ${order.grandTotal}.`;
  return sendMail({ to, subject, html, text });
}

async function sendOrderStatus(order, statusLabel) {
  const to = recipient(order);
  if (!to) throw new Error('No recipient email for order status');
  const subject = `Order ${order.orderNo || order._id} • ${statusLabel}`;
  const tracking = order.tracking ? `\nTracking: ${order.tracking.carrier || '-'} ${order.tracking.number || ''}` : '';
  const text = `Your order is now "${statusLabel}".${tracking}`;
  const html = `
    <h2>Order ${order.orderNo || order._id}: ${statusLabel}</h2>
    <p>Your order status has been updated to <strong>${statusLabel}</strong>.</p>
    ${order.tracking ? `<p>Tracking: <strong>${order.tracking.carrier || '-'}</strong> ${order.tracking.number || ''}</p>` : ''}
  `;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendOrderConfirmation, sendOrderStatus };
