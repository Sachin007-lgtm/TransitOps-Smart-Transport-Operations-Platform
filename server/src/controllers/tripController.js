const Trip = require('../models/tripModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');
const { query } = require('../config/db');

const createTrip = asyncWrapper(async (req, res) => {
  const { vehicle_id, driver_id } = req.body;
  
  // Basic validation that vehicle & driver exist
  const vehicleRes = await query('SELECT * FROM vehicles WHERE id = $1', [vehicle_id]);
  if (vehicleRes.rows.length === 0) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }
  
  const driverRes = await query('SELECT * FROM drivers WHERE id = $1', [driver_id]);
  if (driverRes.rows.length === 0) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }
  
  const newTrip = await Trip.create(req.body);
  return apiResponse.success(res, newTrip, 'Trip created successfully.', 201);
});

const getAllTrips = asyncWrapper(async (req, res) => {
  const { status, vehicle_id, driver_id } = req.query;
  const trips = await Trip.findAll({ status, vehicle_id, driver_id });
  return apiResponse.success(res, trips, 'Trips retrieved successfully.');
});

const getTripById = asyncWrapper(async (req, res) => {
  const trip = await Trip.findById(req.params.id);
  if (!trip) {
    return apiResponse.error(res, 'Trip not found.', 404);
  }
  return apiResponse.success(res, trip, 'Trip retrieved successfully.');
});

const updateTrip = asyncWrapper(async (req, res) => {
  const updatedTrip = await Trip.update(req.params.id, req.body);
  if (!updatedTrip) {
    return apiResponse.error(res, 'Trip not found or no changes made.', 404);
  }
  return apiResponse.success(res, updatedTrip, 'Trip updated successfully.');
});

const deleteTrip = asyncWrapper(async (req, res) => {
  const deletedTrip = await Trip.delete(req.params.id);
  if (!deletedTrip) {
    return apiResponse.error(res, 'Trip not found.', 404);
  }
  return apiResponse.success(res, deletedTrip, 'Trip deleted successfully.');
});

module.exports = {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip
};
