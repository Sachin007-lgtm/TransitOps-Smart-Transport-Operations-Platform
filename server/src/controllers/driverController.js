const Driver = require('../models/driverModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

/**
 * GET /api/drivers
 * Query params: status, license_category
 */
const getAllDrivers = asyncWrapper(async (req, res) => {
  const { status, license_category } = req.query;
  const drivers = await Driver.findAll({ status, license_category });
  return apiResponse.success(res, drivers, 'Drivers retrieved successfully.');
});

/**
 * GET /api/drivers/:id
 */
const getDriverById = asyncWrapper(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }
  return apiResponse.success(res, driver, 'Driver retrieved successfully.');
});

/**
 * POST /api/drivers
 * Additional validations:
 *   - contact_number must be a valid phone number (7-15 digits)
 *   - safety_score must be 0-100
 *   - license_expiry_date must be a valid date
 */
const createDriver = asyncWrapper(async (req, res) => {
  const { license_number, contact_number, safety_score, license_expiry_date } = req.body;

  // Contact format: 7-15 digits (handles international formats)
  if (!/^\+?[\d\s\-]{7,15}$/.test(contact_number)) {
    return apiResponse.error(res, 'contact_number must be a valid phone number (7-15 digits).', 400);
  }

  // Safety score range
  if (safety_score !== undefined) {
    const score = Number(safety_score);
    if (isNaN(score) || score < 0 || score > 100) {
      return apiResponse.error(res, 'safety_score must be an integer between 0 and 100.', 400);
    }
  }

  // Validate license_expiry_date as a real date
  const expiryDate = new Date(license_expiry_date);
  if (isNaN(expiryDate.getTime())) {
    return apiResponse.error(res, 'license_expiry_date must be a valid date (YYYY-MM-DD).', 400);
  }

  // Uniqueness check on license_number
  const existing = await Driver.findByLicense(license_number);
  if (existing) {
    return apiResponse.error(res, `License number '${license_number}' is already registered.`, 409);
  }

  const driver = await Driver.create(req.body);
  return apiResponse.success(res, driver, 'Driver registered successfully.', 201);
});

/**
 * PUT /api/drivers/:id
 */
const updateDriver = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  // Verify driver exists
  const existing = await Driver.findById(id);
  if (!existing) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }

  const { contact_number, safety_score, license_expiry_date, license_number } = req.body;

  // Validate contact_number if provided
  if (contact_number && !/^\+?[\d\s\-]{7,15}$/.test(contact_number)) {
    return apiResponse.error(res, 'contact_number must be a valid phone number (7-15 digits).', 400);
  }

  // Validate safety_score range if provided
  if (safety_score !== undefined) {
    const score = Number(safety_score);
    if (isNaN(score) || score < 0 || score > 100) {
      return apiResponse.error(res, 'safety_score must be an integer between 0 and 100.', 400);
    }
  }

  // Validate date if provided
  if (license_expiry_date) {
    const expiryDate = new Date(license_expiry_date);
    if (isNaN(expiryDate.getTime())) {
      return apiResponse.error(res, 'license_expiry_date must be a valid date (YYYY-MM-DD).', 400);
    }
  }

  // Uniqueness check if license_number is being changed
  if (license_number && license_number !== existing.license_number) {
    const conflict = await Driver.findByLicense(license_number, id);
    if (conflict) {
      return apiResponse.error(res, `License number '${license_number}' is already registered.`, 409);
    }
  }

  const updated = await Driver.update(id, req.body);
  if (!updated) {
    return apiResponse.error(res, 'No changes were made.', 400);
  }
  return apiResponse.success(res, updated, 'Driver updated successfully.');
});

/**
 * DELETE /api/drivers/:id
 */
const deleteDriver = asyncWrapper(async (req, res) => {
  const driver = await Driver.findById(req.params.id);
  if (!driver) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }

  // Prevent deletion if driver is currently On Trip
  if (driver.status === 'On Trip') {
    return apiResponse.error(res, 'Cannot delete a driver that is currently On Trip.', 400);
  }

  const deleted = await Driver.delete(req.params.id);
  return apiResponse.success(res, deleted, 'Driver deleted successfully.');
});

module.exports = {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver
};
