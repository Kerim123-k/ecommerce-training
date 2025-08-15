require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../src/models/Product');
const Category = require('../src/models/Category');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'ecommerce_training' });
    await Product.syncIndexes();
    await Category.syncIndexes();
    console.log('✅ Indexes synced');
    process.exit(0);
  } catch (e) {
    console.error('❌ Index sync failed:', e.message);
    process.exit(1);
  }
})();
