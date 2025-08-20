// src/app.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const morgan  = require('morgan');

const app = express();

/* ---------- Views & core middleware ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));

/* ---------- Sessions (must come BEFORE locals) ---------- */
let store;
if (process.env.NODE_ENV === 'test') {
  store = new session.MemoryStore();
} else {
  const MongoStore = require('connect-mongo');
  store = process.env.MONGO_URI
    ? MongoStore.create({ mongoUrl: process.env.MONGO_URI })
    : new session.MemoryStore();
}
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 },
  store,
}));

const requireAdmin = require('./middleware/requireAdmin');
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/')) return requireAdmin(req, res, next);
  next();
});

/* ---------- Safe locals (after session) ---------- */
app.use((req, res, next) => {
  res.locals.cartCount   = req.session?.cart?.itemCount || 0;
  res.locals.currentUser = req.session?.user || null;
  res.locals.banner      = null;
  next();
});

/* ---------- Routes ---------- */
const authRoutes            = require('./routes/auth.routes');             // /auth/*
const productRoutes         = require('./routes/product.routes');          // /admin/products, /products
const categoryRoutes        = require('./routes/category.routes');         // /admin/categories
const cartRoutes            = require('./routes/cart.routes');             // /cart, /checkout
const accountAddressRoutes  = require('./routes/account.address.routes');  // /account/addresses
const orderRoutes           = require('./routes/order.routes');            // /admin/orders, thank-you, etc.
const accountRoutes = require('./routes/account.routes');


app.use(authRoutes);
app.use(productRoutes);
app.use(categoryRoutes);
app.use(cartRoutes);
app.use(accountAddressRoutes);
app.use(orderRoutes);
app.use(accountRoutes);

/* ---------- Root & health ---------- */
app.get('/', (_req, res) => res.redirect('/products'));
app.get('/healthz', (_req, res) => res.status(200).send('OK'));

/* ---------- 404 (keep last) ---------- */
app.use((_req, res) => res.status(404).send('Not found'));

module.exports = app;
