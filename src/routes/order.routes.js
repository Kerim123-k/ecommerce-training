const router = require('express').Router();

const oc = require('../controllers/order.controller');
const { receiptUpload } = require('../middleware/upload');   // <-- get the right uploader
const requireAdmin = require('../middleware/requireAdmin');

/* =========================
   Customer routes
   ========================= */
router.get('/account/orders', oc.myOrders);
router.get('/account/orders/:id', oc.myOrderShow);

// Upload bank transfer receipt (image/pdf)
router.post(
  '/account/orders/:id/receipt',
  receiptUpload.single('receipt'),   // <-- FIX: now a Multer instance
  oc.uploadReceipt
);

/* =========================
   Admin routes
   ========================= */
router.get('/admin/orders', requireAdmin, oc.adminList);
router.get('/admin/orders/:id', requireAdmin, oc.adminShow);

router.post('/admin/orders/:id/process', requireAdmin, oc.adminProcess);
router.post('/admin/orders/:id/ship',     requireAdmin, oc.adminShip);
router.post('/admin/orders/:id/deliver',  requireAdmin, oc.adminDeliver);
router.post('/admin/orders/:id/cancel',   requireAdmin, oc.adminCancel);

router.get('/admin/dashboard', requireAdmin, oc.adminDashboard);

// Mark Paid (manual payments)
router.post('/admin/orders/:id/mark-paid', requireAdmin, oc.adminMarkPaid);

// Export CSV
router.get('/admin/orders/export/csv', requireAdmin, oc.adminExportCsv);

module.exports = router;
