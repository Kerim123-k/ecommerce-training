const router = require('express').Router();

const oc = require('../controllers/order.controller');
const { receiptUpload } = require('../middleware/upload');
const requireAdmin = require('../middleware/requireAdmin');

// ---------------- Customer ----------------
router.get('/account/orders', oc.myOrders);
router.get('/account/orders/:id', oc.myOrderShow);
router.post('/account/orders/:id/receipt', receiptUpload.single('receipt'), oc.uploadReceipt);
router.get('/account/orders/:id/invoice.pdf', oc.invoiceMy);

// ---------------- Admin ----------------
// Put exports BEFORE any :id routes; support both URL styles
router.get('/admin/orders/export.csv', requireAdmin, oc.adminExportCsv);
router.get('/admin/orders/export/csv', requireAdmin, oc.adminExportCsv);

router.get('/admin/orders', requireAdmin, oc.adminList);

router.get('/admin/orders/:id/invoice.pdf', requireAdmin, oc.invoiceAdmin);
router.get('/admin/orders/:id',            requireAdmin, oc.adminShow);
router.post('/admin/orders/:id/process',   requireAdmin, oc.adminProcess);
router.post('/admin/orders/:id/ship',      requireAdmin, oc.adminShip);
router.post('/admin/orders/:id/deliver',   requireAdmin, oc.adminDeliver);
router.post('/admin/orders/:id/cancel',    requireAdmin, oc.adminCancel);
router.post('/admin/orders/:id/mark-paid', requireAdmin, oc.adminMarkPaid);

router.post('/admin/orders/:id/cancel-approve', requireAdmin, oc.adminCancelApprove);
router.post('/admin/orders/:id/cancel-deny',    requireAdmin, oc.adminCancelDeny);
router.post('/admin/orders/:id/return-approve', requireAdmin, oc.adminReturnApprove);
router.post('/admin/orders/:id/return-deny',    requireAdmin, oc.adminReturnDeny);

router.get('/admin/dashboard', requireAdmin, oc.adminDashboard);

module.exports = router;
