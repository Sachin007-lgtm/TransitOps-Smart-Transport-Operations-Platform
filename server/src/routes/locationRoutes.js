const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  recordLocation,
  getActiveLocations,
  getTripLocations
} = require('../controllers/locationController');

// All location endpoints require valid JWT authentication
router.use(authenticate);

// Drivers and dispatchers can record location updates
router.post(
  '/',
  authorize(['Driver', 'Fleet Manager', 'Dispatcher']),
  recordLocation
);

// Dispatchers and fleet managers can view all active dispatched vehicle locations
router.get(
  '/active',
  authorize(['Fleet Manager', 'Dispatcher']),
  getActiveLocations
);

// Retrieve location history for a specific trip
router.get(
  '/trip/:tripId',
  authorize(['Fleet Manager', 'Dispatcher', 'Driver']),
  getTripLocations
);

module.exports = router;
