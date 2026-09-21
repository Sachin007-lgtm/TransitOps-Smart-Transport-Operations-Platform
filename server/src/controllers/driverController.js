const { driverService, DriverServiceError } = require('../services/driverService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof DriverServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Driver Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

// GET /api/drivers - Scoped strictly to authenticated user's organization
const getAllDrivers = asyncWrapper(async (req, res) => {
  try {
    const drivers = await driverService.listDrivers(req.query, req.user);
    return apiResponse.success(res, drivers, 'Drivers retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/drivers/:id - Scoped strictly to authenticated user's organization
const getDriverById = asyncWrapper(async (req, res) => {
  try {
    const driver = await driverService.getDriverById(req.params.id, req.user);
    return apiResponse.success(res, driver, 'Driver retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/drivers - organization_id is derived exclusively from req.user.organization_id
const createDriver = asyncWrapper(async (req, res) => {
  try {
    const driver = await driverService.createDriver(req.body, req.user);
    return apiResponse.success(res, driver, 'Driver created successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

// PUT /api/drivers/:id - Scoped strictly to authenticated user's organization
const updateDriver = asyncWrapper(async (req, res) => {
  try {
    const updated = await driverService.updateDriver(req.params.id, req.body, req.user);
    return apiResponse.success(res, updated, 'Driver updated successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// DELETE /api/drivers/:id - Scoped strictly to authenticated user's organization
const deleteDriver = asyncWrapper(async (req, res) => {
  try {
    const deleted = await driverService.deleteDriver(req.params.id, req.user);
    return apiResponse.success(res, deleted, 'Driver deleted successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// PATCH /api/drivers/:id/status - Scoped strictly to authenticated user's organization
const updateDriverStatus = asyncWrapper(async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await driverService.updateDriverStatus(req.params.id, status, req.user);
    return apiResponse.success(res, updated, `Driver status updated to '${updated.status}'.`);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  updateDriverStatus
};
