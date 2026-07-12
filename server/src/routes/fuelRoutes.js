const express = require('express');
const router = express.Router();
const {
  createLog,
  getAllLogs,
  getLogById,
  updateLog,
  deleteLog
} = require('../controllers/fuelController');
const { validateCreateFuel, validateUpdateFuel } = require('../validators/fuelValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Require authentication for all routes
router.use(authenticate);

router.route('/')
  .get(authorize(), getAllLogs)
  .post(authorize('Fleet Manager', 'Driver'), validateCreateFuel, createLog);

router.route('/:id')
  .get(authorize(), getLogById)
  .put(authorize('Fleet Manager', 'Financial Analyst'), validateUpdateFuel, updateLog)
  .delete(authorize('Fleet Manager', 'Financial Analyst'), deleteLog);

module.exports = router;
