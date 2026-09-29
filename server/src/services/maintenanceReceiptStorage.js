const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const multer = require('multer');
const apiResponse = require('../utils/apiResponse');

const MAX_RECEIPT_SIZE_BYTES = 10 * 1024 * 1024;
const RECEIPT_STORAGE_DIR = process.env.MAINTENANCE_RECEIPTS_DIR ||
  path.resolve(__dirname, '../../storage/maintenance-receipts');

const allowedTypes = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png'
};

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    fs.mkdir(RECEIPT_STORAGE_DIR, { recursive: true }, error => callback(error, RECEIPT_STORAGE_DIR));
  },
  filename: (req, file, callback) => {
    callback(null, `${randomUUID()}${allowedTypes[file.mimetype] || '.upload'}`);
  }
});

const parseReceiptUpload = multer({
  storage,
  limits: { fileSize: MAX_RECEIPT_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes[file.mimetype]) {
      callback(new Error('Receipt must be a PDF, JPEG, or PNG file.'));
      return;
    }
    callback(null, true);
  }
}).single('receipt');

function uploadMaintenanceReceipt(req, res, next) {
  parseReceiptUpload(req, res, error => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return apiResponse.error(res, error.message || 'Unable to receive receipt file.', status);
  });
}

function getReceiptPath(storageKey) {
  if (typeof storageKey !== 'string' || !/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(storageKey)) {
    return null;
  }
  return path.join(RECEIPT_STORAGE_DIR, storageKey);
}

async function hasExpectedFileSignature(filePath, mimeType) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const header = Buffer.alloc(8);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    const bytes = header.subarray(0, bytesRead);
    if (mimeType === 'application/pdf') return bytes.subarray(0, 5).toString() === '%PDF-';
    if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (mimeType === 'image/png') return bytes.length >= 8 && bytes.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return false;
  } finally {
    await handle.close();
  }
}

async function deleteReceiptFile(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = {
  MAX_RECEIPT_SIZE_BYTES,
  RECEIPT_STORAGE_DIR,
  allowedTypes,
  uploadMaintenanceReceipt,
  getReceiptPath,
  hasExpectedFileSignature,
  deleteReceiptFile
};
