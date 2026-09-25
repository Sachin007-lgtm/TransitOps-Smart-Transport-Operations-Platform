const express = require('express');
const router = express.Router();
const Document = require('../models/documentModel');
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');

// Apply middlewares to all document routes
router.use(authenticate, requireTenantContext);

// Get document alerts (expiring within 30 days or expired)
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await Document.findAlerts(req.user.organization_id);
    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching document alerts' });
  }
});

// Get documents for a specific entity
router.get('/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const documents = await Document.findByEntity(entityType.toUpperCase(), entityId, req.user.organization_id);
    res.json(documents);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error fetching documents' });
  }
});

// Upsert a document
router.post('/', async (req, res) => {
  try {
    const { entity_type, entity_id, document_type, file_url, issue_date, expiry_date } = req.body;
    
    if (!entity_type || !entity_id || !document_type || !file_url || !expiry_date) {
      return res.status(400).json({ error: 'Missing required document fields' });
    }

    const doc = await Document.upsert({
      entity_type: entity_type.toUpperCase(),
      entity_id,
      document_type,
      file_url,
      issue_date,
      expiry_date
    }, req.user.organization_id);

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error saving document' });
  }
});

module.exports = router;
