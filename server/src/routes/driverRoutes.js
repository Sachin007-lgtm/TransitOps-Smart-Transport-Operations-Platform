const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
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
router.post('/', createDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);
router.patch('/:id/status', updateDriverStatus);

module.exports = router;
