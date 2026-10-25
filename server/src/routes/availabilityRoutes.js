const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  requestCheck,
  respondCheck,
  getTripChecks,
  getDriverPendingChecks,
  assignFromCheck
} = require('../controllers/availabilityController');

router.use(authenticate);

const READ_ROLES = ['Owner/Manager', 'Dispatcher', 'Driver'];
const WRITE_ROLES = ['Owner/Manager', 'Dispatcher'];
const DRIVER_ROLES = ['Driver', 'Owner/Manager', 'Dispatcher'];

router.post('/request', authorize(WRITE_ROLES), requestCheck);
router.get('/trip/:tripId', authorize(READ_ROLES), getTripChecks);
router.get('/driver/pending', authorize(DRIVER_ROLES), getDriverPendingChecks);
router.post('/:id/respond', authorize(DRIVER_ROLES), respondCheck);
router.patch('/:id/assign', authorize(WRITE_ROLES), assignFromCheck);

module.exports = router;
