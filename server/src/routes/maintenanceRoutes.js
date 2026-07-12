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

// All maintenance routes require authentication
router.use(authenticate);

router.route('/')
  .post(authorize('Fleet Manager', 'Safety Officer'), validateCreateMaintenance, createLog)
  .get(authorize(), getAllLogs);

router.route('/:id')
  .get(authorize(), getLogById)
  .put(authorize('Fleet Manager', 'Safety Officer'), validateUpdateMaintenance, updateLog)
  .delete(authorize('Fleet Manager'), deleteLog);

module.exports = router;
