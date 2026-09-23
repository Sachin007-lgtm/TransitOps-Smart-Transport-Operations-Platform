const { locationService, LocationServiceError } = require('../services/locationService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof LocationServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Location Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

const recordLocation = asyncWrapper(async (req, res) => {
  try {
    const location = await locationService.recordLocation(req.body, req.user);
    return apiResponse.success(res, location, 'Location recorded successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const getActiveLocations = asyncWrapper(async (req, res) => {
  try {
    const locations = await locationService.getLatestActiveLocations(req.user);
    return apiResponse.success(res, locations, 'Active locations retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getTripLocations = asyncWrapper(async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 500;
    const history = await locationService.getTripHistory(req.params.tripId, req.user, limit);
    return apiResponse.success(res, history, 'Trip locations retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  recordLocation,
  getActiveLocations,
  getTripLocations
};
