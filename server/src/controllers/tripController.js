const { tripService, TripServiceError } = require('../services/tripService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof TripServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Trip Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

const createTrip = asyncWrapper(async (req, res) => {
  try {
    const newTrip = await tripService.createTrip(req.body, req.user);
    return apiResponse.success(res, newTrip, 'Trip created successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const getAllTrips = asyncWrapper(async (req, res) => {
  try {
    const trips = await tripService.listTrips(req.query, req.user);
    return apiResponse.success(res, trips, 'Trips retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getTripById = asyncWrapper(async (req, res) => {
  try {
    const trip = await tripService.getTripById(req.params.id, req.user);
    return apiResponse.success(res, trip, 'Trip retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const updateTrip = asyncWrapper(async (req, res) => {
  try {
    const updated = await tripService.updateTrip(req.params.id, req.body, req.user);
    return apiResponse.success(res, updated, 'Trip updated successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const updateTripStatus = asyncWrapper(async (req, res) => {
  try {
    const updated = await tripService.updateTripStatus(req.params.id, req.body, req.user);
    return apiResponse.success(res, updated, `Trip status updated to '${updated.status}'.`);
  } catch (err) {
    return handleError(res, err);
  }
});

const deleteTrip = asyncWrapper(async (req, res) => {
  try {
    const deleted = await tripService.deleteTrip(req.params.id, req.user);
    return apiResponse.success(res, deleted, 'Trip deleted successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  updateTripStatus,
  deleteTrip
};
