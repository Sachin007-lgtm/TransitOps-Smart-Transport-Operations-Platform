const express = require('express');
const router = express.Router();
const { getAllDrivers, getDriverById, createDriver, updateDriver, deleteDriver, updateDriverStatus } = require('../controllers/driverController');

router.get('/', getAllDrivers);
router.get('/:id', getDriverById);
router.post('/', createDriver);
router.put('/:id', updateDriver);
router.delete('/:id', deleteDriver);
router.patch('/:id/status', updateDriverStatus);

module.exports = router;
