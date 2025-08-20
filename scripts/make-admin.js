// scripts/make-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const email = (process.argv[2] || '').toLowerCase();
    if (!email) throw new Error('Usage: node scripts/make-admin.js you@example.com');

    const u = await Customer.findOneAndUpdate(
      { email },
      { role: 'Admin' },
      { new: true }
    );
    if (!u) {
      console.log('No user found with that email');
    } else {
      console.log('Updated:', u.email, 'role =', u.role);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
})();

