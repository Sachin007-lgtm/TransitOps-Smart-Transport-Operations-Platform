const express = require('express');
const router = express.Router();

const authRoutes    = require('./authRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const driverRoutes  = require('./driverRoutes');
const tripRoutes    = require('./tripRoutes');

router.use('/auth',     authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/drivers',  driverRoutes);
router.use('/trips',    tripRoutes);

// Additional routes for Maintenance, Fuel, Expenses, and Reports will be registered here.

module.exports = router;
