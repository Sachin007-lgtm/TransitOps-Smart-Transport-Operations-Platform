const express = require('express');
const router = express.Router();

const authRoutes    = require('./authRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const driverRoutes  = require('./driverRoutes');
const tripRoutes    = require('./tripRoutes');

const maintenanceRoutes = require('./maintenanceRoutes');

router.use('/auth',     authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/drivers',  driverRoutes);
router.use('/trips',    tripRoutes);
router.use('/maintenance', maintenanceRoutes);

module.exports = router;
