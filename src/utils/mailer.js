const nodemailer = require('nodemailer');

let transporter;
function getTx() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 587),
    secure: false,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transporter;
}

async function sendOrderConfirmation({ to, order }) {
  const tx = getTx();
  const lines = (order.items || []).map(i => `• ${i.title} x${i.qty} — ₺${(i.qty*i.unitPrice).toFixed(2)}`).join('\n');
  const shipping = `₺${Number(order.shipping || 0).toFixed(2)}`;
  const tax      = `₺${Number(order.tax || 0).toFixed(2)}`;
  const total    = `₺${Number(order.grandTotal || order.subtotal).toFixed(2)}`;
  const text = [
    `Thanks for your order ${order.orderNo || order._id}!`,
    '',
    lines, '',
    `Subtotal: ₺${Number(order.subtotal || 0).toFixed(2)}`,
    `Shipping: ${shipping}`,
    `Tax: ${tax}`,
    `Total: ${total}`,
  ].join('\n');

  await tx.sendMail({
    from: process.env.MAIL_FROM || 'no-reply@example.com',
    to,
    subject: `Order confirmation ${order.orderNo || order._id}`,
    text,
  });
}

module.exports = { sendOrderConfirmation };
