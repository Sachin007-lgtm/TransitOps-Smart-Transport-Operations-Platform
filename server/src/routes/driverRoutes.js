const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const authorize = require('../middleware/authorize');
const {
  validateCreateDriver,
  validateUpdateDriver,
  validateDriverStatus
} = require('../validators/driverValidator');
const {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  updateDriverStatus,
  resetDriverPassword,
  importDriversFromCsv
} = require('../controllers/driverController');

// All driver endpoints require valid JWT authentication with tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Driver management is restricted strictly to Owner/Manager
router.use(authorize(['Owner/Manager']));

router.get('/', getAllDrivers);
router.get('/:id', getDriverById);
router.post('/', validateCreateDriver, createDriver);
router.put('/:id', validateUpdateDriver, updateDriver);
router.delete('/:id', deleteDriver);
router.patch('/:id/status', validateDriverStatus, updateDriverStatus);
router.post('/:id/reset-password', resetDriverPassword);

// Bulk import drivers from a CSV file (Owner/Manager only).
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const apiResponse = require('../utils/apiResponse');

const CSV_STORAGE_DIR = process.env.CSV_UPLOADS_DIR ||
  path.resolve(__dirname, '../../storage/csv-uploads');
fs.mkdirSync(CSV_STORAGE_DIR, { recursive: true });

const csvStorage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, CSV_STORAGE_DIR),
  filename: (req, file, callback) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    callback(null, safeName);
  }
});

const parseCsvUpload = multer({
  storage: csvStorage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = file.mimetype;
    const isCsv = ext === '.csv' || mime === 'text/csv' || mime === 'application/vnd.ms-excel';
    if (!isCsv) {
      callback(new Error('Only CSV files are allowed.'));
      return;
    }
    callback(null, true);
  }
}).single('csv');

router.post('/import/csv', (req, res, next) => {
  parseCsvUpload(req, res, (error) => {
    if (error) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return apiResponse.error(res, error.message || 'Unable to receive CSV file.', status);
    }
    next();
  });
}, importDriversFromCsv);

module.exports = router;
