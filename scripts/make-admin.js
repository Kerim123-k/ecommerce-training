// scripts/make-admin.js
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const email = 'kerimhariri@gmail.com';
  const res = await Customer.updateOne({ email }, { $set: { role: 'admin' }});
  console.log('Updated:', res);
  await mongoose.disconnect();
})();
