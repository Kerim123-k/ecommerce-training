const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const a = require('../controllers/auth.controller');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Register
router.get('/auth/register', a.registerForm);
router.post(
  '/auth/register',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
  ],
  a.register
);

// Login / Logout
router.get('/auth/login', a.loginForm);
router.post(
  '/auth/login',
  loginLimiter,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password required'),
  ],
  a.login
);
router.post('/auth/logout', a.logout);

// Forgot / Reset
router.get('/auth/forgot', a.forgotForm);
router.post(
  '/auth/forgot',
  [body('email').isEmail().withMessage('Valid email required')],
  a.forgot
);

router.get('/auth/reset/:token', a.resetForm);
router.post(
  '/auth/reset/:token',
  [body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')],
  a.reset
);

module.exports = router;
