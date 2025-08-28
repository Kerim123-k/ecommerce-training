// src/services/mailer.js
const nodemailer = require('nodemailer');

const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_PORT) === '465',
  auth: (process.env.SMTP_USER && process.env.SMTP_PASS) ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

async function send({ to, subject, html, text }) {
  const from = process.env.MAIL_FROM || 'no-reply@localhost';
  return transport.sendMail({ from, to, subject, html, text });
}

module.exports = { send };
