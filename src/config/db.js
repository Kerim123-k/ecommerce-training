// src/config/db.js
const mongoose = require('mongoose');

module.exports = async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is missing');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'ecommerce_training' });
  console.log('✅ Mongo connected:', mongoose.connection.name);
  return mongoose.connection;
};
