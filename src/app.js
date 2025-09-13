// src/app.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const morgan  = require('morgan');

const couponRoutes = require('./routes/coupon.routes');
const authController   = require('./controllers/auth.controller');
const orderController  = require('./controllers/order.controller');

const app = express();

/* ---------- Views & core middleware ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use(morgan(process.env.NODE_ENV === 'test' ? 'tiny' : 'dev'));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));


/* ---------- Sessions (must come BEFORE locals & routes) ---------- */
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
  cookie: { maxAge: 1000 * 60 * 60 }, // 1h
  store,
}));

// after app.use(session(...))
app.use((req, res, next) => {
  const list = Array.isArray(req.session.wishlist) ? req.session.wishlist : [];
  const ids  = list.filter(Boolean).map(String);

  res.locals.wishIds   = ids;         // used to paint hearts red
  res.locals.wishCount = ids.length;  // used for the header bubble
  next();
});


/* ---------- Gate admin URLs ---------- */
const requireAdmin = require('./middleware/requireAdmin');
app.use((req, res, next) => {
  if (req.path.startsWith('/admin/')) return requireAdmin(req, res, next);
  next();
});

/* ---------- Safe locals (after session) ---------- */
// Safe locals (after session)
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;

  // --- Wishlist (session is a plain array) ---
  const wl = Array.isArray(req.session.wishlist)
    ? req.session.wishlist.filter(Boolean).map(String)
    : [];

  // aliases so old/new templates both work
  res.locals.wishIds       = wl;
  res.locals.wishlistIds   = wl;
  res.locals.wishCount     = wl.length;
  res.locals.wishlistCount = wl.length;

  // --- Cart badge ---
  const items = Array.isArray(req.session?.cart?.items) ? req.session.cart.items : [];
  res.locals.cartCount = items.reduce((n, it) => n + Number(it.qty || 0), 0);

  res.locals.banner = null;
  next();
});



/* ---------- Routes ---------- */
const authRoutes            = require('./routes/auth.routes');             // /auth/*
const productRoutes         = require('./routes/product.routes');          // /admin/products, /products
const categoryRoutes        = require('./routes/category.routes');         // /admin/categories
const cartRoutes            = require('./routes/cart.routes');             // /cart, /checkout (mock)
const accountAddressRoutes  = require('./routes/account.address.routes');  // /account/addresses
const orderRoutes           = require('./routes/order.routes');            // /admin/orders, account orders
const accountRoutes         = require('./routes/account.routes');
const reviewRoutes          = require('./routes/review.routes');
const wishlistRoutes        = require('./routes/wishlist.routes');
const paymentRoutes         = require('./routes/payment.routes');          // /checkout/card (demo), etc.

app.use(authRoutes);
app.use(productRoutes);
app.use(categoryRoutes);
app.use(cartRoutes);
app.use(accountAddressRoutes);
app.use(orderRoutes);
app.use(accountRoutes);
app.use(reviewRoutes);
app.use(wishlistRoutes);
app.use(paymentRoutes); // ✅ mount AFTER session & parsers
app.use(couponRoutes);
// src/server.js (or wherever you do app.use)
app.use(require('./routes/productImages.routes'));


/* ---------- Root & health ---------- */
app.get('/', (_req, res) => res.redirect('/products'));
app.get('/healthz', (_req, res) => res.status(200).send('OK'));

/* ---------- 404 (keep last) ---------- */
app.use((_req, res) => res.status(404).send('Not found'));

app.get('/account/delete', authController.deleteAccountForm);
app.post('/account/delete', authController.deleteAccount);

module.exports = app;
