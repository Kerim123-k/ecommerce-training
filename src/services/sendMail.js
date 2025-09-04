// src/services/sendMail.js
const nodemailer = require('nodemailer');

function createTransport() {
  const provider = (process.env.MAIL_PROVIDER || '').toLowerCase();

  // Mailtrap (optional) — keep working if you switch back
  if (provider === 'mailtrap') {
    return nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST || 'sandbox.smtp.mailtrap.io',
      port: Number(process.env.MAILTRAP_PORT || 2525),
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
      },
    });
  }

  // Default: SMTP (Gmail)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true', // 465 true, 587 false
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, html, text }) {
  const transporter = createTransport();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;

  const info = await transporter.sendMail({ from, to, subject, html, text });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[mail] sent:', info.messageId, 'to:', to);
  }
  return info;
}

module.exports = { createTransport, sendMail };
