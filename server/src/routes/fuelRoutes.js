const express = require('express');
const router = express.Router();
const {
  createFuelLog,
  getAllFuelLogs,
  getFuelLogById,
  updateFuelLog,
  deleteFuelLog
} = require('../controllers/fuelController');
const { validateCreateFuel, validateUpdateFuel } = require('../validators/fuelValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// All fuel routes require authentication
router.use(authenticate);

router.route('/')
  .post(authorize('Fleet Manager', 'Financial Analyst'), validateCreateFuel, createFuelLog)
  .get(authorize('Fleet Manager', 'Financial Analyst', 'Driver'), getAllFuelLogs);

router.route('/:id')
  .get(authorize('Fleet Manager', 'Financial Analyst', 'Driver'), getFuelLogById)
  .put(authorize('Fleet Manager', 'Financial Analyst'), validateUpdateFuel, updateFuelLog)
  .delete(authorize('Fleet Manager', 'Financial Analyst'), deleteFuelLog);

module.exports = router;
