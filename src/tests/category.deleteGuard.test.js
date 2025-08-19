const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../app');                 // from src/tests -> src/app
const Category = require('../models/Category');
const Product  = require('../models/Product');

let mongo;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'jest' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

// Clean between tests
beforeEach(async () => {
  const { collections } = mongoose.connection;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
});

test('cannot delete a category referenced by non-deleted products', async () => {
  const cat = await Category.create({ name: 'A', slug: 'a', status: 'Active' });

  await Product.create({
    title: 'P',
    sku: 'SKU1',
    price: 10,
    stockQty: 1,
    status: 'Draft',
    images: [],
    categories: [cat._id]
  });

  const res = await request(app).post(`/admin/categories/${cat._id}/delete`);
  expect(res.status).toBe(400);
  expect(res.text).toMatch(/Cannot delete/i);
});
