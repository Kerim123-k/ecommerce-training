/**
 * scripts/seed_demo.js
 * Seeds demo categories + products with product-appropriate images.
 *
 * Run:
 *   node scripts/seed_demo.js
 *
 * Requires:
 *   - MONGO_URI in .env (or it will default to local mongodb://127.0.0.1:27017/training-shop)
 *   - Existing Mongoose models at src/models/Product and src/models/Category
 */

'use strict';
require('dotenv').config();

const mongoose = require('mongoose');
const slugify   = require('slugify');

// If your project exposes a DB util, you can require it instead. This is standalone.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/training-shop';

// import existing app models (paths match your project)
const Product  = require('../src/models/Product');
const Category = require('../src/models/Category');

/* -------------------------------------------------------------------------- */
/*                               Image helpers                                */
/* -------------------------------------------------------------------------- */

/**
 * Keyword-based image set from Unsplash Source.
 * These are relevant, quick, and good for screenshots.
 */
function themed(keyword) {
  // Stable, predictable images by seed (no throttling/redirect problems)
  const seed = encodeURIComponent(String(keyword || 'product'));
  return [
    `https://picsum.photos/seed/${seed}/800/600`,
    `https://picsum.photos/seed/${seed}-2/800/600`,
    `https://picsum.photos/seed/${seed}-3/800/600`
  ];
}


/**
 * If you want *stable* (non-rotating) images, you can paste fixed Unsplash image URLs here.
 * Leave empty to use “themed” images above.
 */
const FIXED_IMG_BY_SKU = {
  // Example:
  // 'DEMO-KEYBOARD': [
  //   'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1200&q=80&auto=format',
  //   'https://images.unsplash.com/photo-1518779578993-ec3579fee39f?w=1200&q=80&auto=format',
  //   'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1200&q=80&auto=format'
  // ],
};

/** Map SKUs to keywords that produce product-matching photos. */
const KEYWORD_BY_SKU = {
  'DEMO-WATCH-BAND':    'smartwatch band',
  'DEMO-YOGA-MAT':      'yoga mat',
  'DEMO-BOTTLE':        'insulated water bottle',
  'DEMO-SUNSCREEN':     'sunscreen',
  'DEMO-CLEANSER':      'facial cleanser',
  'DEMO-MUG-SET':       'ceramic mug',
  'DEMO-FRY-PAN':       'nonstick frying pan',
  'DEMO-KEYBOARD':      'mechanical keyboard',
  'DEMO-TABLET-STAND':  'tablet stand',
  'DEMO-LAPTOP-SLEEVE': 'laptop sleeve',
  'DEMO-SPEAKER':       'bluetooth speaker',
  'DEMO-USBC-CHARGER':  'usb c charger',
};

function imagesForProduct(prod) {
  if (FIXED_IMG_BY_SKU[prod.sku]) return FIXED_IMG_BY_SKU[prod.sku];
  const key = KEYWORD_BY_SKU[prod.sku] || prod.title;
  return themed(key);
}

/* -------------------------------------------------------------------------- */
/*                         Demo categories & products                         */
/* -------------------------------------------------------------------------- */

const CATEGORIES = [
  { name: 'Electronics',     slug: 'electronics' },
  { name: 'Home & Kitchen',  slug: 'home-kitchen' },
  { name: 'Outdoors',        slug: 'outdoors' },
  { name: 'Beauty & Care',   slug: 'beauty' },
  { name: 'Accessories',     slug: 'accessories' },
];

const PRODUCTS = [
  { title: 'Smartwatch Band',      sku: 'DEMO-WATCH-BAND',    price: 259.00, category: 'Accessories',     trackInventory: true, stockQty: 35 },
  { title: 'Yoga Mat',             sku: 'DEMO-YOGA-MAT',      price: 499.00, category: 'Outdoors',        trackInventory: true, stockQty: 25 },
  { title: 'Insulated Water Bottle 750ml', sku: 'DEMO-BOTTLE', price: 329.00, category: 'Outdoors',        trackInventory: true, stockQty: 40 },
  { title: 'Sunscreen SPF 50',     sku: 'DEMO-SUNSCREEN',     price: 289.00, category: 'Beauty & Care',    trackInventory: true, stockQty: 50 },
  { title: 'Facial Cleanser',      sku: 'DEMO-CLEANSER',      price: 189.00, category: 'Beauty & Care',    trackInventory: true, stockQty: 60 },
  { title: 'Ceramic Mug (2-Pack)', sku: 'DEMO-MUG-SET',       price: 149.00, category: 'Home & Kitchen',   trackInventory: true, stockQty: 70 },
  { title: 'Nonstick Frying Pan',  sku: 'DEMO-FRY-PAN',       price: 399.00, category: 'Home & Kitchen',   trackInventory: true, stockQty: 20 },
  { title: 'Mechanical Keyboard',  sku: 'DEMO-KEYBOARD',      price: 1299.00,category: 'Electronics',      trackInventory: true, stockQty: 15 },
  { title: 'Tablet Stand',         sku: 'DEMO-TABLET-STAND',  price: 219.00, category: 'Accessories',      trackInventory: true, stockQty: 45 },
  { title: '15” Laptop Sleeve',    sku: 'DEMO-LAPTOP-SLEEVE', price: 279.00, category: 'Accessories',      trackInventory: true, stockQty: 30 },
  { title: 'Bluetooth Speaker',    sku: 'DEMO-SPEAKER',       price: 549.00, category: 'Electronics',      trackInventory: true, stockQty: 22 },
  { title: 'USB-C Fast Charger',   sku: 'DEMO-USBC-CHARGER',  price: 189.00, category: 'Electronics',      trackInventory: true, stockQty: 55 },
];

/* -------------------------------------------------------------------------- */
/*                                   Seed                                     */
/* -------------------------------------------------------------------------- */

(async function main() {
  await mongoose.connect(MONGO_URI, {
    autoIndex: true,
  });
  console.log('Connected to MongoDB');

  // Upsert categories and keep a name->id map
  const catIdByName = {};
  for (const c of CATEGORIES) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $setOnInsert: { name: c.name, slug: c.slug, status: 'Active' } },
      { new: true, upsert: true }
    ).lean();
    const id = doc?._id || (await Category.findOne({ slug: c.slug }).lean())._id;
    catIdByName[c.name] = id;
  }
  console.log('Categories ready:', Object.keys(catIdByName).join(', '));

  // Seed / upsert products by SKU
  for (const p of PRODUCTS) {
    const imgs = imagesForProduct(p);
    const body = {
      title:  p.title,
      sku:    p.sku,
      price:  Number(p.price),
      status: 'Active',
      trackInventory: !!p.trackInventory,
      stockQty: Number(p.stockQty || 0),
      image:  imgs[0],
      images: imgs,
      categories: catIdByName[p.category] ? [catIdByName[p.category]] : [],
      slug: slugify(p.title, { lower: true, strict: true }),
    };

    await Product.findOneAndUpdate(
      { sku: p.sku },
      { $set: body },
      { upsert: true }
    );

    console.log(`Upserted: ${p.sku} – ${p.title}`);
  }

  console.log('✅ Demo data seeded. Open http://localhost:3000/products');
  await mongoose.disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
