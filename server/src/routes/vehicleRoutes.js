const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  updateVehicleStatus,
  deleteVehicle
} = require('../controllers/vehicleController');

// All vehicle endpoints require authenticated session with organization context
router.use(authenticate);

router.get('/', getAllVehicles);
router.get('/:id', getVehicleById);
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.patch('/:id', updateVehicle);
router.patch('/:id/status', updateVehicleStatus);
router.delete('/:id', deleteVehicle);

module.exports = router;
