const { availabilityService, AvailabilityServiceError } = require('../services/availabilityService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof AvailabilityServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Availability Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error.', 500);
};

const requestCheck = asyncWrapper(async (req, res) => {
  try {
    const check = await availabilityService.requestCheck(req.body, req.user);
    return apiResponse.success(res, check, 'Availability check requested from driver.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const respondCheck = asyncWrapper(async (req, res) => {
  try {
    const updated = await availabilityService.respondCheck(
      { check_id: req.params.id, ...req.body },
      req.user
    );
    return apiResponse.success(res, updated, 'Driver location & ETA recorded.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getTripChecks = asyncWrapper(async (req, res) => {
  try {
    const checks = await availabilityService.getTripChecks(req.params.tripId, req.user);
    return apiResponse.success(res, checks, 'Trip candidate checks fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getDriverPendingChecks = asyncWrapper(async (req, res) => {
  try {
    const checks = await availabilityService.getDriverPendingChecks(req.query.driver_id, req.user);
    return apiResponse.success(res, checks, 'Pending checks fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

const assignFromCheck = asyncWrapper(async (req, res) => {
  try {
    const result = await availabilityService.assignFromCheck(req.params.id, req.body, req.user);
    return apiResponse.success(res, result, 'Driver assigned to trip.');
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  requestCheck,
  respondCheck,
  getTripChecks,
  getDriverPendingChecks,
  assignFromCheck
};
