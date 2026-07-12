const FuelLog = require('../models/fuelModel');
const Vehicle = require('../models/vehicleModel');
const Trip = require('../models/tripModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const createLog = asyncWrapper(async (req, res) => {
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

  const newLog = await FuelLog.create(req.body);
  return apiResponse.success(res, newLog, 'Fuel log created successfully.', 201);
});

const getAllLogs = asyncWrapper(async (req, res) => {
  const { vehicle_id, trip_id } = req.query;
  const logs = await FuelLog.findAll({ vehicle_id, trip_id });
  return apiResponse.success(res, logs, 'Fuel logs retrieved successfully.');
});

const getLogById = asyncWrapper(async (req, res) => {
  const log = await FuelLog.findById(req.params.id);
  if (!log) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }
  return apiResponse.success(res, log, 'Fuel log retrieved successfully.');
});

const updateLog = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { vehicle_id, trip_id } = req.body;

  const existingLog = await FuelLog.findById(id);
  if (!existingLog) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }

  if (vehicle_id) {
    const vehicle = await Vehicle.findById(vehicle_id);
    if (!vehicle) {
      return apiResponse.error(res, 'Vehicle not found.', 404);
    }
  }

  if (trip_id) {
    const trip = await Trip.findById(trip_id);
    if (!trip) {
      return apiResponse.error(res, 'Trip not found.', 404);
    }
  }

  const updatedLog = await FuelLog.update(id, req.body);
  return apiResponse.success(res, updatedLog, 'Fuel log updated successfully.');
});

const deleteLog = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const deletedLog = await FuelLog.delete(id);
  if (!deletedLog) {
    return apiResponse.error(res, 'Fuel log not found.', 404);
  }
  return apiResponse.success(res, deletedLog, 'Fuel log deleted successfully.');
});

module.exports = {
  createLog,
  getAllLogs,
  getLogById,
  updateLog,
  deleteLog
};
