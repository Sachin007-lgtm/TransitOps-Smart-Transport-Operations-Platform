const Fuel = require('../models/fuelModel');
const Vehicle = require('../models/vehicleModel');
const Trip = require('../models/tripModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const createFuelLog = asyncWrapper(async (req, res) => {
  const { vehicle_id, trip_id } = req.body;

  const vehicle = await Vehicle.findById(vehicle_id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }

  if (trip_id) {
    const trip = await Trip.findById(trip_id);
    if (!trip) {
      return apiResponse.error(res, 'Trip not found.', 404);
    }
  }

  const newLog = await Fuel.create(req.body);
  return apiResponse.success(res, newLog, 'Fuel log created successfully.', 201);
});

const getAllFuelLogs = asyncWrapper(async (req, res) => {
  const { vehicle_id, trip_id } = req.query;
  const logs = await Fuel.findAll({ vehicle_id, trip_id });
  return apiResponse.success(res, logs, 'Fuel logs retrieved successfully.');
});

const getFuelLogById = asyncWrapper(async (req, res) => {
  const log = await Fuel.findById(req.params.id);
  if (!log) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }
  return apiResponse.success(res, log, 'Fuel log retrieved successfully.');
});

const updateFuelLog = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const existingLog = await Fuel.findById(id);
  
  if (!existingLog) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }

  const updatedLog = await Fuel.update(id, req.body);
  if (!updatedLog) {
    return apiResponse.error(res, 'No changes made.', 400);
  }
  return apiResponse.success(res, updatedLog, 'Fuel log updated successfully.');
});

const deleteFuelLog = asyncWrapper(async (req, res) => {
  const deletedLog = await Fuel.delete(req.params.id);
  if (!deletedLog) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }
  return apiResponse.success(res, deletedLog, 'Fuel log deleted successfully.');
});

module.exports = {
  createFuelLog,
  getAllFuelLogs,
  getFuelLogById,
  updateFuelLog,
  deleteFuelLog
};
