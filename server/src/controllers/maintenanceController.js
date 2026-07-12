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

  // Business Rule: Retired or In Shop vehicles must never appear in dispatch selection, 
  // but a vehicle currently On Trip cannot be put into maintenance immediately.
  if (vehicle.status === 'On Trip') {
    return apiResponse.error(res, 'Cannot put a vehicle in maintenance while it is On Trip.', 400);
  }

  const newLog = await Maintenance.create(req.body);

  // If status is Active (default), transition vehicle to 'In Shop'
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
    const vehicle = await Vehicle.findById(existingLog.vehicle_id);
    if (!vehicle) {
      return apiResponse.error(res, 'Vehicle associated with this log not found.', 404);
    }

    if (status === 'Closed') {
      // Revert vehicle back to Available (unless already Retired)
      if (vehicle.status !== 'Retired') {
        await Vehicle.setStatus(existingLog.vehicle_id, 'Available');
      }
      
      // Auto-populate end_date if not provided
      if (!req.body.end_date) {
        req.body.end_date = new Date().toISOString().split('T')[0];
      }
    } else if (status === 'Active') {
      if (vehicle.status === 'On Trip') {
        return apiResponse.error(res, 'Cannot re-activate maintenance: Vehicle is currently On Trip.', 400);
      }
      await Vehicle.setStatus(existingLog.vehicle_id, 'In Shop');
      req.body.end_date = null; // Clear end date on reactivation
    }
  }

  const updatedLog = await Maintenance.update(id, req.body);
  return apiResponse.success(res, updatedLog, 'Maintenance log updated successfully.');
});

const deleteLog = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const existingLog = await Maintenance.findById(id);
  if (!existingLog) {
    return apiResponse.error(res, 'Maintenance log not found.', 404);
  }

  const deletedLog = await Maintenance.delete(id);

  // If we delete an Active log, restore vehicle to Available (unless retired)
  if (existingLog.status === 'Active') {
    const vehicle = await Vehicle.findById(existingLog.vehicle_id);
    if (vehicle && vehicle.status !== 'Retired') {
      await Vehicle.setStatus(existingLog.vehicle_id, 'Available');
    }
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
