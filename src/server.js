// src/server.js
require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./app');

const port = process.env.PORT || 3000;

async function start() {
  if (!process.env.MONGO_URI) {
    console.error('❌ Missing MONGO_URI in .env');
    process.exit(1);
  }
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Mongo connected:', mongoose.connection.name);
  } catch (err) {
    console.error('❌ Mongo connect failed:', err.message);
    process.exit(1);
  }

  app.listen(port, () => console.log(`▶ http://localhost:${port}`));
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
