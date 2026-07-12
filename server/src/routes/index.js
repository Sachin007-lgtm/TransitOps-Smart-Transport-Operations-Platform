const express = require('express');
const router = express.Router();

const tripRoutes = require('./tripRoutes');

router.use('/trips', tripRoutes);

// Additional routes for Maintenance, Fuel, Expenses, and Reports will be registered here.

module.exports = router;
