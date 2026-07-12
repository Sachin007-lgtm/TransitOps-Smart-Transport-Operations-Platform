const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/reportController');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Require authentication
router.use(authenticate);

// Accessible by Fleet Manager and Financial Analyst
router.get('/dashboard', authorize('Fleet Manager', 'Financial Analyst'), getDashboardStats);

module.exports = router;
