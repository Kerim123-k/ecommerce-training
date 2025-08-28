// Generic uploads (products + receipts)
// - Saves under /public/uploads/{products|receipts}/YYYY/MM/
// - Limits size via MAX_UPLOAD_MB (default 8MB)
// - Validates mime types per uploader

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 8);
const LIMITS = { fileSize: MAX_UPLOAD_MB * 1024 * 1024 };

// Ensure a directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Build a storage engine for a subdir (e.g., 'products' or 'receipts')
function storageFor(subdir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const now = new Date();
      const base = path.join(__dirname, '..', '..', 'public', 'uploads', subdir,
        String(now.getFullYear()),
        String(now.getMonth() + 1).padStart(2, '0'));
      ensureDir(base);
      cb(null, base);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || guessExt(file.mimetype);
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
      cb(null, name);
    }
  });
}

function guessExt(mime) {
  if (!mime) return '';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/pdf') return '.pdf';
  return '';
}

// File filters
function imageOnly(_req, file, cb) {
  const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
  cb(ok ? null : new Error('Only JPG/PNG/WebP images are allowed'), ok);
}

function receiptFilter(_req, file, cb) {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype);
  cb(ok ? null : new Error('Only JPG/PNG/WebP or PDF receipts are allowed'), ok);
}

// Two separate Multer instances (so you can call .single(...) on them)
const productUpload  = multer({ storage: storageFor('products'), limits: LIMITS, fileFilter: imageOnly });
const receiptUpload  = multer({ storage: storageFor('receipts'), limits: LIMITS, fileFilter: receiptFilter });

module.exports = {
  productUpload,  // use: productUpload.single('imageFile')
  receiptUpload,  // use: receiptUpload.single('receipt')
};
