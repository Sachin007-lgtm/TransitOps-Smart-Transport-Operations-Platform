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
  resetDriverPassword
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

module.exports = router;
