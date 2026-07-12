const Maintenance = require('../models/maintenanceModel');
const Vehicle = require('../models/vehicleModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const createLog = asyncWrapper(async (req, res) => {
  const { vehicle_id, status } = req.body;

  const vehicle = await Vehicle.findById(vehicle_id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }

  if (vehicle.status === 'On Trip') {
    return apiResponse.error(res, 'Cannot put a vehicle in maintenance while it is On Trip.', 400);
  }

  const newLog = await Maintenance.create(req.body);

  // If status is Active (default), move vehicle to 'In Shop'
  if (!status || status === 'Active') {
    await Vehicle.setStatus(vehicle_id, 'In Shop');
  }

  return apiResponse.success(res, newLog, 'Maintenance log created successfully.', 201);
});

const getAllLogs = asyncWrapper(async (req, res) => {
  const { status, vehicle_id } = req.query;
  const logs = await Maintenance.findAll({ status, vehicle_id });
  return apiResponse.success(res, logs, 'Maintenance logs retrieved successfully.');
});

const getLogById = asyncWrapper(async (req, res) => {
  const log = await Maintenance.findById(req.params.id);
  if (!log) {
    return apiResponse.error(res, 'Maintenance log not found.', 404);
  }
  return apiResponse.success(res, log, 'Maintenance log retrieved successfully.');
});

const updateLog = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const existingLog = await Maintenance.findById(id);
  
  if (!existingLog) {
    return apiResponse.error(res, 'Maintenance log not found.', 404);
  }

  const { status } = req.body;
  
  // State transition logic
  if (status && status !== existingLog.status) {
    if (status === 'Closed') {
      // Free up vehicle
      await Vehicle.setStatus(existingLog.vehicle_id, 'Available');
    } else if (status === 'Active') {
      // Re-activate maintenance
      const vehicle = await Vehicle.findById(existingLog.vehicle_id);
      if (vehicle.status === 'On Trip') {
         return apiResponse.error(res, 'Cannot activate maintenance: Vehicle is currently On Trip.', 400);
      }
      await Vehicle.setStatus(existingLog.vehicle_id, 'In Shop');
    }
  }

  const updatedLog = await Maintenance.update(id, req.body);
  if (!updatedLog) {
    return apiResponse.error(res, 'No changes made.', 400);
  }
  return apiResponse.success(res, updatedLog, 'Maintenance log updated successfully.');
});

const deleteLog = asyncWrapper(async (req, res) => {
  const deletedLog = await Maintenance.delete(req.params.id);
  if (!deletedLog) {
    return apiResponse.error(res, 'Maintenance log not found.', 404);
  }
  return apiResponse.success(res, deletedLog, 'Maintenance log deleted successfully.');
});

module.exports = {
  createLog,
  getAllLogs,
  getLogById,
  updateLog,
  deleteLog
};
