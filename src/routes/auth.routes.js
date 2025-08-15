const router = require('express').Router();
const { body } = require('express-validator');
const a = require('../controllers/auth.controller');
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/auth/register', a.registerForm);
router.post('/auth/register', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars')
], a.register);

router.get('/auth/login', a.loginForm);
router.post('/auth/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], a.login);

router.post('/auth/logout', a.logout);



router.get('/auth/forgot', a.forgotForm);
router.post('/auth/forgot', [ body('email').isEmail().withMessage('Valid email required') ], a.forgot);

router.get('/auth/reset/:token', a.resetForm);
router.post('/auth/reset/:token', [ body('password').isLength({min:6}).withMessage('Password min 6 chars') ], a.reset);


router.post('/auth/login', loginLimiter, [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required')
], a.login);


router.get('/auth/forgot', a.forgotForm);
router.post('/auth/forgot',
  [ body('email').isEmail().withMessage('Valid email required') ],
  a.forgot
);

// Reset password
router.get('/auth/reset/:token', a.resetForm);
router.post('/auth/reset/:token',
  [ body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters') ],
  a.reset
);

module.exports = router;
