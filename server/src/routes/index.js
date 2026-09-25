const express = require('express');
const router = express.Router();

const tripRoutes = require('./tripRoutes');
const driverRoutes = require('./driverRoutes');
const authRoutes = require('./authRoutes');
const vehicleRoutes = require('./vehicleRoutes');
const fuelRoutes = require('./fuelRoutes');
const expenseRoutes = require('./expenseRoutes');
const maintenanceRoutes = require('./maintenanceRoutes');
const reportRoutes = require('./reportRoutes');
const userRoutes = require('./userRoutes');
const locationRoutes = require('./locationRoutes');
const platformRoutes = require('./platformRoutes');
const documentRoutes = require('./documentRoutes');

router.use('/trips', tripRoutes);
router.use('/drivers', driverRoutes);
router.use('/auth', authRoutes);
router.use('/vehicles', vehicleRoutes);
router.use('/fuel', fuelRoutes);
router.use('/expenses', expenseRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);
router.use('/locations', locationRoutes);
router.use('/platform', platformRoutes);
router.use('/documents', documentRoutes);

module.exports = router;
