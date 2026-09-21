const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
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
  updateDriverStatus
} = require('../controllers/driverController');

// All driver endpoints require valid JWT authentication with tenant context
router.use(authenticate);

router.get('/', getAllDrivers);
router.get('/:id', getDriverById);
router.post('/', validateCreateDriver, createDriver);
router.put('/:id', validateUpdateDriver, updateDriver);
router.delete('/:id', deleteDriver);
router.patch('/:id/status', validateDriverStatus, updateDriverStatus);

module.exports = router;
