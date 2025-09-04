const router = require('express').Router();

const oc = require('../controllers/order.controller');
const { receiptUpload } = require('../middleware/upload');   // <-- get the right uploader
const requireAdmin = require('../middleware/requireAdmin');
const orders = require('../controllers/order.controller');
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
router.get('/account/orders/:id/invoice.pdf', oc.invoiceMy);

// Admin invoice
router.get('/admin/orders/:id/invoice.pdf', requireAdmin, oc.invoiceAdmin);
router.post('/admin/orders/:id/process', requireAdmin, oc.adminProcess);
router.post('/admin/orders/:id/ship',     requireAdmin, oc.adminShip);
router.post('/admin/orders/:id/deliver',  requireAdmin, oc.adminDeliver);
router.post('/admin/orders/:id/cancel',   requireAdmin, oc.adminCancel);

router.get('/admin/dashboard', requireAdmin, oc.adminDashboard);

// Mark Paid (manual payments)
router.post('/admin/orders/:id/mark-paid', requireAdmin, oc.adminMarkPaid);



router.post('/admin/orders/:id/cancel-approve', orders.adminCancelApprove);
router.post('/admin/orders/:id/cancel-deny',    orders.adminCancelDeny);

// Approve / deny return
router.post('/admin/orders/:id/return-approve', orders.adminReturnApprove);
router.post('/admin/orders/:id/return-deny',    orders.adminReturnDeny);
// Export CSV
router.get('/admin/orders/export/csv', requireAdmin, oc.adminExportCsv);

module.exports = router;
