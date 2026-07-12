const express = require('express');
const router = express.Router();

const authRoutes    = require('./authRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const driverRoutes  = require('./driverRoutes');
const tripRoutes    = require('./tripRoutes');

const maintenanceRoutes = require('./maintenanceRoutes');
const fuelRoutes = require('./fuelRoutes');
const expenseRoutes = require('./expenseRoutes');

router.use('/auth',     authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/drivers',  driverRoutes);
router.use('/trips',    tripRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/fuel', fuelRoutes);
router.use('/expenses', expenseRoutes);

module.exports = router;
