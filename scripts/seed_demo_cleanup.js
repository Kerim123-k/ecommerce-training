/**
 * scripts/seed_demo_cleanup.js
 * Removes demo products (SKUs starting with DEMO-) so you can reseed cleanly.
 *
 * Run:
 *   node scripts/seed_demo_cleanup.js
 */

'use strict';
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/training-shop';

const Product  = require('../src/models/Product');

(async function main() {
  await mongoose.connect(MONGO_URI, { autoIndex: true });
  const res = await Product.deleteMany({ sku: /^DEMO-/i });
  console.log(`Deleted ${res.deletedCount} demo products.`);
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
