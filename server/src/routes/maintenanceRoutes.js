const express = require('express');
const router = express.Router();
const {
  createLog,
  getAllLogs,
  getLogById,
  updateLog,
  deleteLog
} = require('../controllers/maintenanceController');
const { validateCreateMaintenance, validateUpdateMaintenance } = require('../validators/maintenanceValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Require authentication for all routes
router.use(authenticate);

router.route('/')
  .get(authorize(), getAllLogs)
  .post(authorize('Fleet Manager'), validateCreateMaintenance, createLog);

router.route('/:id')
  .get(authorize(), getLogById)
  .put(authorize('Fleet Manager'), validateUpdateMaintenance, updateLog)
  .delete(authorize('Fleet Manager'), deleteLog);

module.exports = router;
