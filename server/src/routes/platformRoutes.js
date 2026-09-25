const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requirePlatformAdmin = require('../middleware/requirePlatformAdmin');
const {
  createOrganization,
  listOrganizations,
  getOrganizationById,
  updateOrganizationStatus
} = require('../controllers/platformController');

// All platform endpoints require valid Platform Admin authentication
router.use(authenticate);
router.use(requirePlatformAdmin);

router.post('/organizations', createOrganization);
router.get('/organizations', listOrganizations);
router.get('/organizations/:id', getOrganizationById);
router.patch('/organizations/:id/status', updateOrganizationStatus);

module.exports = router;
