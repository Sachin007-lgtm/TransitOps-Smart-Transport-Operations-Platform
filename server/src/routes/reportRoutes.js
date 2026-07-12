const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getFuelEfficiency,
  getFleetUtilization,
  getOperationalCosts,
  getVehicleROI,
  exportCSVReport
} = require('../controllers/reportController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Require authentication for all reports
router.use(authenticate);

// Accessible by Fleet Manager and Financial Analyst
router.get('/dashboard', authorize('Fleet Manager', 'Financial Analyst'), getDashboardStats);
router.get('/fuel-efficiency', authorize('Fleet Manager', 'Financial Analyst'), getFuelEfficiency);
router.get('/fleet-utilization', authorize('Fleet Manager', 'Financial Analyst'), getFleetUtilization);
router.get('/operational-cost', authorize('Fleet Manager', 'Financial Analyst'), getOperationalCosts);
router.get('/vehicle-roi', authorize('Fleet Manager', 'Financial Analyst'), getVehicleROI);
router.get('/export', authorize('Fleet Manager', 'Financial Analyst'), exportCSVReport);

module.exports = router;
