const { vehicleService, VehicleServiceError } = require('../services/vehicleService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof VehicleServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Vehicle Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

const getAllVehicles = asyncWrapper(async (req, res) => {
  try {
    const vehicles = await vehicleService.listVehicles(req.query, req.user);
    return apiResponse.success(res, vehicles, 'Vehicles retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getVehicleById = asyncWrapper(async (req, res) => {
  try {
    const vehicle = await vehicleService.getVehicleById(req.params.id, req.user);
    return apiResponse.success(res, vehicle, 'Vehicle retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const createVehicle = asyncWrapper(async (req, res) => {
  try {
    const newVehicle = await vehicleService.createVehicle(req.body, req.user);
    return apiResponse.success(res, newVehicle, 'Vehicle created successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const updateVehicle = asyncWrapper(async (req, res) => {
  try {
    const updated = await vehicleService.updateVehicle(req.params.id, req.body, req.user);
    return apiResponse.success(res, updated, 'Vehicle updated successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const updateVehicleStatus = asyncWrapper(async (req, res) => {
  try {
    const { status } = req.body;
    const updated = await vehicleService.updateVehicleStatus(req.params.id, status, req.user);
    return apiResponse.success(res, updated, `Vehicle status updated to '${updated.status}'.`);
  } catch (err) {
    return handleError(res, err);
  }
});

const deleteVehicle = asyncWrapper(async (req, res) => {
  try {
    const deleted = await vehicleService.deleteVehicle(req.params.id, req.user);
    return apiResponse.success(res, deleted, 'Vehicle deleted successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  updateVehicleStatus,
  deleteVehicle
};
