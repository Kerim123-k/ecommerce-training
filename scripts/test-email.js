// scripts/test-email.js
require('dotenv').config();
const { sendMail } = require('../src/services/sendMail');

(async () => {
  const to = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  await sendMail({
    to,
    subject: 'SMTP sanity check',
    text: 'If you received this, SMTP is working.',
    html: '<p>If you received this, <strong>SMTP is working</strong>.</p>',
  });
  console.log('OK sent to', to);
})();
