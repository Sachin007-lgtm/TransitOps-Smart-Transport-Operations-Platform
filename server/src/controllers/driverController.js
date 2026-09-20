const Driver = require('../models/driverModel');

// GET /api/drivers - Scoped strictly to authenticated user's organization
const getAllDrivers = async (req, res, next) => {
  try {
    const { status, license_category } = req.query;
    const orgId = req.user.organization_id;
    const drivers = await Driver.findAll({ status, license_category, organization_id: orgId });
    res.json({ success: true, data: drivers });
  } catch (err) {
    next(err);
  }
};

// GET /api/drivers/:id - Scoped strictly to authenticated user's organization
const getDriverById = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const driver = await Driver.findById(req.params.id, orgId);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// POST /api/drivers - organization_id is derived exclusively from req.user.organization_id
const createDriver = async (req, res, next) => {
  try {
    const { license_number } = req.body;
    const orgId = req.user.organization_id;

    const existing = await Driver.findByLicense(license_number);
    if (existing) {
      return res.status(409).json({ success: false, error: 'License number already exists' });
    }

    // Explicitly enforce authenticated organization context, ignoring any client-provided organization_id
    const driverPayload = {
      ...req.body,
      organization_id: orgId
    };

    const driver = await Driver.create(driverPayload);
    res.status(201).json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// PUT /api/drivers/:id - Scoped strictly to authenticated user's organization
const updateDriver = async (req, res, next) => {
  try {
    const { license_number } = req.body;
    const orgId = req.user.organization_id;

    if (license_number) {
      const existing = await Driver.findByLicense(license_number, req.params.id);
      if (existing) {
        return res.status(409).json({ success: false, error: 'License number already in use' });
      }
    }

    const driver = await Driver.update(req.params.id, req.body, orgId);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/drivers/:id - Scoped strictly to authenticated user's organization
const deleteDriver = async (req, res, next) => {
  try {
    const orgId = req.user.organization_id;
    const existing = await Driver.findById(req.params.id, orgId);
    if (!existing) return res.status(404).json({ success: false, error: 'Driver not found' });
    if (existing.status === 'On Trip') {
      return res.status(400).json({ success: false, error: 'Cannot delete a driver currently On Trip' });
    }

    const driver = await Driver.delete(req.params.id, orgId);
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/drivers/:id/status - Scoped strictly to authenticated user's organization
const updateDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const orgId = req.user.organization_id;
    const allowed = ['Available', 'On Trip', 'Off Duty', 'Suspended'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }

    const driver = await Driver.setStatus(req.params.id, status, orgId);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllDrivers, getDriverById, createDriver, updateDriver, deleteDriver, updateDriverStatus };
