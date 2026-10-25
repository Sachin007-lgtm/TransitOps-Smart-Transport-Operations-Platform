const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const authorize = require('../middleware/authorize');
const {
  getDriverPunctuality,
  getLeaderboard
} = require('../controllers/punctualityController');

router.use(authenticate);
router.use(requireTenantContext);

// Fleet leaderboard: Manager only
router.get(
  '/leaderboard',
  authorize(['Owner/Manager']),
  getLeaderboard
);

// Individual scorecard: Driver (own) or Manager (all)
router.get(
  '/driver/:driverId',
  authorize(['Owner/Manager', 'Driver']),
  getDriverPunctuality
);

module.exports = router;
