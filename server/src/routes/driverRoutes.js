const express = require('express');
const router = express.Router();
const {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver
} = require('../controllers/driverController');
const { validateCreateDriver, validateUpdateDriver } = require('../validators/driverValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// All driver routes require authentication
router.use(authenticate);

router.route('/')
  // All authenticated roles can read driver list
  .get(authorize(), getAllDrivers)
  // Only Fleet Manager registers drivers
  .post(authorize('Fleet Manager'), validateCreateDriver, createDriver);

router.route('/:id')
  .get(authorize(), getDriverById)
  // Fleet Manager and Safety Officer can update driver profiles
  .put(authorize('Fleet Manager', 'Safety Officer'), validateUpdateDriver, updateDriver)
  .delete(authorize('Fleet Manager'), deleteDriver);

module.exports = router;
