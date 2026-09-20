const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  updateTripStatus,
  deleteTrip
} = require('../controllers/tripController');
const {
  validateCreateTrip,
  validateUpdateTrip,
  validateUpdateTripStatus
} = require('../validators/tripValidator');

// All trip endpoints require valid JWT authentication
router.use(authenticate);

router.route('/')
  .post(
    authorize(['Fleet Manager', 'Dispatcher']),
    validateCreateTrip,
    createTrip
  )
  .get(
    authorize(['Fleet Manager', 'Dispatcher', 'Driver']),
    getAllTrips
  );

router.route('/:id')
  .get(
    authorize(['Fleet Manager', 'Dispatcher', 'Driver']),
    getTripById
  )
  .patch(
    authorize(['Fleet Manager', 'Dispatcher']),
    validateUpdateTrip,
    updateTrip
  )
  .put(
    authorize(['Fleet Manager', 'Dispatcher']),
    validateUpdateTrip,
    updateTrip
  )
  .delete(
    authorize(['Fleet Manager']),
    deleteTrip
  );

router.route('/:id/status')
  .patch(
    authorize(['Fleet Manager', 'Dispatcher']),
    validateUpdateTripStatus,
    updateTripStatus
  );

module.exports = router;
