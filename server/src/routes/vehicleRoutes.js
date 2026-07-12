const express = require('express');
const router = express.Router();
const {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
} = require('../controllers/vehicleController');
const { validateCreateVehicle, validateUpdateVehicle } = require('../validators/vehicleValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// All vehicle routes require authentication
router.use(authenticate);

router.route('/')
  // All authenticated roles can read vehicles
  .get(authorize(), getAllVehicles)
  // Only Fleet Manager can register a vehicle
  .post(authorize('Fleet Manager'), validateCreateVehicle, createVehicle);

router.route('/:id')
  .get(authorize(), getVehicleById)
  .put(authorize('Fleet Manager'), validateUpdateVehicle, updateVehicle)
  .delete(authorize('Fleet Manager'), deleteVehicle);

module.exports = router;
