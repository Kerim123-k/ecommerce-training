// scripts/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const Product  = require('../src/models/Product');
const Category = require('../src/models/Category');
const Customer = require('../src/models/Customer');
const Order    = require('../src/models/Order');

function makeOrderNo() {
  return `ORD-${Date.now()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

// Put totals in BOTH places (top-level + nested) so either schema style is satisfied
function withTotals(base, items, { shipping = 0, tax = 0 } = {}) {
  const subtotal = Number(items.reduce((s, it) => s + it.qty * it.unitPrice, 0).toFixed(2));
  const grandTotal = Number((subtotal + shipping + tax).toFixed(2));
  return {
    ...base,
    items,
    // top-level fields (your schema requires these):
    subtotal,
    grandTotal,
    // nested object (optional / future-proof):
    totals: { subTotal: subtotal, shipping, tax, grandTotal },
  };
}

(async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('MONGO_URI missing from .env');
    await mongoose.connect(uri);
    console.log('✅ Connected');

    const doReset = process.argv.includes('--reset');
    if (doReset) {
      console.log('♻️  Resetting collections…');
      await Promise.all([
        Product.deleteMany({}),
        Category.deleteMany({}),
        Customer.deleteMany({}),
        Order.deleteMany({}),
      ]);
    }

    // ---- Categories ----
    const sports  = await Category.create({ name: 'Sports',  slug: 'sports',  status: 'Active' });
    const gadgets = await Category.create({ name: 'Gadgets', slug: 'gadgets', status: 'Active' });

    // ---- Products ----
    const p1 = await Product.create({
      title: 'example_product',
      sku: 'XYZ1234',
      price: 20,
      stockQty: 20,
      trackInventory: true,
      status: 'Active',
      categories: [sports._id],
      images: ['https://upload.wikimedia.org/wikipedia/commons/f/f1/Basketball_02.jpg'],
      slug: 'example_product',
    });

    const p2 = await Product.create({
      title: 'Wireless Earbuds',
      sku: 'EARBUDS01',
      price: 59.9,
      stockQty: 50,
      trackInventory: true,
      status: 'Active',
      categories: [gadgets._id],
      images: ['https://upload.wikimedia.org/wikipedia/commons/3/3c/Earbuds.jpg'],
      slug: 'wireless-earbuds',
    });

    // ---- Customer ----
    const passHash = await bcrypt.hash('pass1234', 10);
    const user = await Customer.create({
      email: 'demo@shop.test',
      passwordHash: passHash,
      firstName: 'Demo',
      lastName: 'User',
      addresses: [
        {
          fullName: 'DEMO USER',
          line1: '123 Demo St',
          city: 'Istanbul',
          postalCode: '34000',
          country: 'TR',
          phone: '05000000000',
          isDefault: true,
        },
        {
          fullName: 'DEMO USER',
          line1: '456 Second Ave',
          city: 'Ankara',
          postalCode: '06000',
          country: 'TR',
          phone: '05000000001',
          isDefault: false,
        },
      ],
      status: 'Active',
    });

    // convenience address snapshot
    const addr = user.addresses[0];

    // ---- Orders (snapshots) ----
    const order1 = withTotals({
      orderNo: makeOrderNo(),
      customerId: user._id,
      customerEmail: user.email,
      shippingAddress: addr,
      status: 'Paid',
      payment: { method: 'Mock', txnId: 'seed-1' },
    }, [
      { productId: p1._id, sku: p1.sku, title: p1.title, qty: 2, unitPrice: p1.price },
    ]);

    const order2 = withTotals({
      orderNo: makeOrderNo(),
      customerId: user._id,
      customerEmail: user.email,
      shippingAddress: addr,
      status: 'Shipped',
      payment: { method: 'Mock', txnId: 'seed-2' },
      tracking: { carrier: 'UPS', number: '1ZSEEDTRACK' },
    }, [
      { productId: p2._id, sku: p2.sku, title: p2.title, qty: 1, unitPrice: p2.price },
    ]);

    await Order.create(order1);
    await Order.create(order2);

    console.log('🌱 Seeded:',
      '\n  Categories:', await Category.countDocuments(),
      '\n  Products  :', await Product.countDocuments(),
      '\n  Customers :', await Customer.countDocuments(),
      '\n  Orders    :', await Order.countDocuments()
    );

    await mongoose.disconnect();
    console.log('✅ Done');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed error:', err);
    process.exit(1);
  }
})();
