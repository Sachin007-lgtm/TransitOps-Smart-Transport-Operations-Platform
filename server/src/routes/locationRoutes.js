const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const authorize = require('../middleware/authorize');
const {
  recordLocation,
  getActiveLocations,
  getTripLocations
} = require('../controllers/locationController');

// All location endpoints require valid JWT authentication with tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Drivers and Owner/Managers can record location updates
router.post(
  '/',
  authorize(['Driver', 'Owner/Manager']),
  recordLocation
);

// Owner/Managers can view all active dispatched vehicle locations
router.get(
  '/active',
  authorize(['Owner/Manager']),
  getActiveLocations
);

// Retrieve location history for a specific trip
router.get(
  '/trip/:tripId',
  authorize(['Owner/Manager', 'Driver']),
  getTripLocations
);

module.exports = router;
