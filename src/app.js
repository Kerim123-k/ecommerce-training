// src/app.js
const path = require('path');
const express = require('express');
const morgan = require('morgan');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const session = require('express-session');
const MongoStore = require('connect-mongo');


dotenv.config();

const app = express();

// View engine & static
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Parsers & logs
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(morgan('dev'));

// Sessions (login + cart)
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    dbName: 'ecommerce_training',
    collectionName: 'sessions'
  }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 } // 7 days
}));

// Make user & cart count available to all views
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  const cart = req.session.cart || { items: [], itemCount: 0, subtotal: 0 };
  res.locals.cartCount = cart.itemCount;
  next();
});


// Routes
app.get('/', (_req, res) => res.redirect('/products'));
app.use(require('./routes/category.routes'));
app.use(require('./routes/product.routes'));



app.use(require('./routes/auth.routes'));
app.use(require('./routes/cart.routes'));
app.use(require('./routes/order.routes'));



app.use(require('./routes/account.routes'));



// 404 (optional)
app.use((req, res) => res.status(404).send('Not found'));

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

// Start after DB connects
const port = process.env.PORT || 3000;
connectDB(process.env.MONGO_URI)
  .then(() => app.listen(port, () => console.log(`▶ http://localhost:${port}`)))
  .catch(err => {
    console.error('❌ Mongo connect failed:', err.message);
    process.exit(1);
  });


  app.get('/healthz', (_req,res)=>res.type('text').send('OK'));

app.use(require('./routes/account.routes'));
