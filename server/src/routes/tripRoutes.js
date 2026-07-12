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

router.route('/')
  .post(validateCreateTrip, createTrip)
  .get(getAllTrips);

router.route('/:id')
  .get(getTripById)
  .put(validateUpdateTrip, updateTrip)
  .delete(deleteTrip);

module.exports = router;
