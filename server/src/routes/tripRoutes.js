const express = require('express');
const router = express.Router();
const {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip
} = require('../controllers/tripController');
const { validateCreateTrip, validateUpdateTrip } = require('../validators/tripValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// All trip routes require authentication
router.use(authenticate);

router.route('/')
  .post(authorize('Fleet Manager'), validateCreateTrip, createTrip)
  // All authenticated users can view trips (Drivers can view their own, enforced in controller/UI optionally)
  .get(authorize(), getAllTrips);

router.route('/:id')
  .get(authorize(), getTripById)
  // Fleet Manager and Driver can update trips
  .put(authorize('Fleet Manager', 'Driver'), validateUpdateTrip, updateTrip)
  .delete(authorize('Fleet Manager'), deleteTrip);

module.exports = router;
