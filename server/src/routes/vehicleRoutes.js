const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const authorize = require('../middleware/authorize');
const {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  updateVehicleStatus,
  deleteVehicle
} = require('../controllers/vehicleController');

// All vehicle endpoints require authenticated session with tenant context
router.use(authenticate);
router.use(requireTenantContext);

// Vehicle fleet management is restricted to Owner/Manager
router.use(authorize(['Owner/Manager']));

router.get('/', getAllVehicles);
router.get('/:id', getVehicleById);
router.post('/', createVehicle);
router.put('/:id', updateVehicle);
router.patch('/:id', updateVehicle);
router.patch('/:id/status', updateVehicleStatus);
router.delete('/:id', deleteVehicle);

module.exports = router;
