const Driver = require('../models/driverModel');

// GET /api/drivers
const getAllDrivers = async (req, res, next) => {
  try {
    const { status, license_category } = req.query;
    const drivers = await Driver.findAll({ status, license_category });
    res.json({ success: true, data: drivers });
  } catch (err) {
    next(err);
  }
};

// GET /api/drivers/:id
const getDriverById = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// POST /api/drivers
const createDriver = async (req, res, next) => {
  try {
    const { license_number } = req.body;
    const existing = await Driver.findByLicense(license_number);
    if (existing) {
      return res.status(409).json({ success: false, error: 'License number already exists' });
    }
    const driver = await Driver.create(req.body);
    res.status(201).json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// PUT /api/drivers/:id
const updateDriver = async (req, res, next) => {
  try {
    const { license_number } = req.body;
    if (license_number) {
      const existing = await Driver.findByLicense(license_number, req.params.id);
      if (existing) {
        return res.status(409).json({ success: false, error: 'License number already in use' });
      }
    }
    const driver = await Driver.update(req.params.id, req.body);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/drivers/:id
const deleteDriver = async (req, res, next) => {
  try {
    const existing = await Driver.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Driver not found' });
    if (existing.status === 'On Trip') {
      return res.status(400).json({ success: false, error: 'Cannot delete a driver currently On Trip' });
    }
    const driver = await Driver.delete(req.params.id);
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/drivers/:id/status
const updateDriverStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ['Available', 'On Trip', 'Off Duty', 'Suspended'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    }
    const driver = await Driver.setStatus(req.params.id, status);
    if (!driver) return res.status(404).json({ success: false, error: 'Driver not found' });
    res.json({ success: true, data: driver });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllDrivers, getDriverById, createDriver, updateDriver, deleteDriver, updateDriverStatus };
