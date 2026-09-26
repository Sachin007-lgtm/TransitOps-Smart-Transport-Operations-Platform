const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
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

// All trip endpoints require valid JWT authentication with tenant context
router.use(authenticate);
router.use(requireTenantContext);

router.route('/')
  .post(
    authorize(['Owner/Manager']),
    validateCreateTrip,
    createTrip
  )
  .get(
    authorize(['Owner/Manager', 'Driver']),
    getAllTrips
  );

router.route('/:id')
  .get(
    authorize(['Owner/Manager', 'Driver']),
    getTripById
  )
  .patch(
    authorize(['Owner/Manager']),
    validateUpdateTrip,
    updateTrip
  )
  .put(
    authorize(['Owner/Manager']),
    validateUpdateTrip,
    updateTrip
  )
  .delete(
    authorize(['Owner/Manager']),
    deleteTrip
  );

router.route('/:id/status')
  .patch(
    authorize(['Owner/Manager', 'Driver']),
    validateUpdateTripStatus,
    updateTripStatus
  );

module.exports = router;
