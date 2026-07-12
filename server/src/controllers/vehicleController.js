const Vehicle = require('../models/vehicleModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

/**
 * GET /api/vehicles
 * Query params: status, type
 */
const getAllVehicles = asyncWrapper(async (req, res) => {
  const { status, type } = req.query;
  const vehicles = await Vehicle.findAll({ status, type });
  return apiResponse.success(res, vehicles, 'Vehicles retrieved successfully.');
});

/**
 * GET /api/vehicles/:id
 */
const getVehicleById = asyncWrapper(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }
  return apiResponse.success(res, vehicle, 'Vehicle retrieved successfully.');
});

/**
 * POST /api/vehicles
 * Business rule: registration_number must be unique.
 */
const createVehicle = asyncWrapper(async (req, res) => {
  const { registration_number } = req.body;

  // Uniqueness check
  const existing = await Vehicle.findByRegistration(registration_number);
  if (existing) {
    return apiResponse.error(res, `Registration number '${registration_number}' is already in use.`, 409);
  }

  const vehicle = await Vehicle.create(req.body);
  return apiResponse.success(res, vehicle, 'Vehicle registered successfully.', 201);
});

/**
 * PUT /api/vehicles/:id
 * Also enforces registration_number uniqueness when it is being changed.
 */
const updateVehicle = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  // Verify vehicle exists
  const existing = await Vehicle.findById(id);
  if (!existing) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }

  // If registration_number is being changed, check uniqueness against other vehicles
  if (req.body.registration_number && req.body.registration_number !== existing.registration_number) {
    const conflict = await Vehicle.findByRegistration(req.body.registration_number, id);
    if (conflict) {
      return apiResponse.error(res, `Registration number '${req.body.registration_number}' is already in use.`, 409);
    }
  }

  const updated = await Vehicle.update(id, req.body);
  if (!updated) {
    return apiResponse.error(res, 'No changes were made.', 400);
  }
  return apiResponse.success(res, updated, 'Vehicle updated successfully.');
});

/**
 * DELETE /api/vehicles/:id
 */
const deleteVehicle = asyncWrapper(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }

  // Prevent deletion if vehicle is On Trip
  if (vehicle.status === 'On Trip') {
    return apiResponse.error(res, 'Cannot delete a vehicle that is currently On Trip.', 400);
  }

  const deleted = await Vehicle.delete(req.params.id);
  return apiResponse.success(res, deleted, 'Vehicle deleted successfully.');
});

module.exports = {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle
};
