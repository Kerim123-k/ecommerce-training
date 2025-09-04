// src/services/authEmails.js
const { sendMail } = require('./sendMail');

async function sendPasswordReset(user, resetUrl) {
  const to = (user.email || '').trim();
  if (!to) throw new Error('User has no email');
  const subject = 'Reset your password';
  const html = `
    <p>Hello,</p>
    <p>Click the link below to reset your password:</p>
    <p><a href="${resetUrl}" target="_blank" rel="noopener">${resetUrl}</a></p>
    <p>If you didn’t request this, you can safely ignore this email.</p>
  `;
  const text = `Reset your password: ${resetUrl}`;
  return sendMail({ to, subject, html, text });
}

module.exports = { sendPasswordReset };
