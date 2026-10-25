const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const reportController = require('../controllers/reportController');

router.use(authenticate);
router.use(requireTenantContext);

router.get('/dashboard', reportController.getDashboardOverview);

module.exports = router;
