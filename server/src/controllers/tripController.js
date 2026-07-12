const Trip = require('../models/tripModel');
const Vehicle = require('../models/vehicleModel');
const Driver = require('../models/driverModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');
const { query } = require('../config/db');

const createTrip = asyncWrapper(async (req, res) => {
  const { vehicle_id, driver_id, cargo_weight, status } = req.body;

  const vehicle = await Vehicle.findById(vehicle_id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }

  const driver = await Driver.findById(driver_id);
  if (!driver) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }

  // Validate cargo weight vs vehicle capacity
  if (Number(cargo_weight) > Number(vehicle.max_load_capacity)) {
    return apiResponse.error(
      res, 
      `Cargo weight (${cargo_weight} kg) exceeds vehicle maximum capacity (${vehicle.max_load_capacity} kg).`, 
      400
    );
  }

  // Handle immediate dispatch if status is set to Dispatched on creation
  if (status === 'Dispatched') {
    if (vehicle.status !== 'Available') {
      return apiResponse.error(res, `Cannot dispatch: Vehicle ${vehicle.name} is currently ${vehicle.status}.`, 400);
    }
    if (driver.status !== 'Available') {
      return apiResponse.error(res, `Cannot dispatch: Driver ${driver.name} is currently ${driver.status}.`, 400);
    }

    // Validate license expiry
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(driver.license_expiry_date);
    if (expiry < today) {
      return apiResponse.error(res, `Cannot dispatch: Driver's license has expired.`, 400);
    }

    // Update statuses to On Trip
    await Vehicle.setStatus(vehicle_id, 'On Trip');
    await Driver.setStatus(driver_id, 'On Trip');
  } else if (status === 'Completed' || status === 'Cancelled') {
    return apiResponse.error(res, `New trips cannot be created in ${status} status.`, 400);
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
  const { id } = req.params;
  const existingTrip = await Trip.findById(id);
  
  if (!existingTrip) {
    return apiResponse.error(res, 'Trip not found.', 404);
  }

  const { status, vehicle_id, driver_id, cargo_weight, actual_distance } = req.body;

  // 1. Prevent changing vehicle/driver if the trip is already ongoing or completed
  if (existingTrip.status !== 'Draft' && (vehicle_id || driver_id)) {
    return apiResponse.error(
      res, 
      'Cannot change vehicle or driver on a trip that is already dispatched, completed, or cancelled.', 
      400
    );
  }

  // 2. Validate cargo capacity if vehicle or weight is changing
  const finalVehicleId = vehicle_id || existingTrip.vehicle_id;
  const finalCargoWeight = cargo_weight !== undefined ? cargo_weight : Number(existingTrip.cargo_weight);

  const vehicle = await Vehicle.findById(finalVehicleId);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }
  if (finalCargoWeight > Number(vehicle.max_load_capacity)) {
    return apiResponse.error(
      res, 
      `Cargo weight (${finalCargoWeight} kg) exceeds vehicle maximum capacity (${vehicle.max_load_capacity} kg).`, 
      400
    );
  }

  // 3. State transition validations
  if (status && status !== existingTrip.status) {
    if (status === 'Dispatched') {
      if (existingTrip.status !== 'Draft') {
        return apiResponse.error(res, 'Can only dispatch a trip that is in Draft status.', 400);
      }
      if (vehicle.status !== 'Available') {
        return apiResponse.error(res, `Cannot dispatch: Vehicle ${vehicle.name} is currently ${vehicle.status}.`, 400);
      }

      const driver = await Driver.findById(driver_id || existingTrip.driver_id);
      if (!driver) {
        return apiResponse.error(res, 'Driver not found.', 404);
      }
      if (driver.status !== 'Available') {
        return apiResponse.error(res, `Cannot dispatch: Driver ${driver.name} is currently ${driver.status}.`, 400);
      }

      // Check license expiry
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(driver.license_expiry_date);
      if (expiry < today) {
        return apiResponse.error(res, `Cannot dispatch: Driver's license has expired.`, 400);
      }

      // Transition statuses to On Trip
      await Vehicle.setStatus(existingTrip.vehicle_id, 'On Trip');
      await Driver.setStatus(existingTrip.driver_id, 'On Trip');

    } else if (status === 'Completed') {
      if (existingTrip.status !== 'Dispatched') {
        return apiResponse.error(res, 'Only Dispatched trips can be marked as Completed.', 400);
      }

      const finalActualDistance = actual_distance !== undefined ? actual_distance : existingTrip.actual_distance;
      if (finalActualDistance === undefined || finalActualDistance === null || Number(finalActualDistance) <= 0) {
        return apiResponse.error(res, 'actual_distance must be a positive number to complete a trip.', 400);
      }

      // Free up vehicle and driver
      await Vehicle.setStatus(existingTrip.vehicle_id, 'Available');
      await Driver.setStatus(existingTrip.driver_id, 'Available');

      // Update vehicle odometer
      await query('UPDATE vehicles SET odometer = odometer + $1 WHERE id = $2', [finalActualDistance, existingTrip.vehicle_id]);

    } else if (status === 'Cancelled') {
      if (existingTrip.status === 'Completed' || existingTrip.status === 'Cancelled') {
        return apiResponse.error(res, `Cannot cancel a trip that is already ${existingTrip.status}.`, 400);
      }

      if (existingTrip.status === 'Dispatched') {
        // Free up vehicle and driver
        await Vehicle.setStatus(existingTrip.vehicle_id, 'Available');
        await Driver.setStatus(existingTrip.driver_id, 'Available');
      }
    }
  }

  const updatedTrip = await Trip.update(id, req.body);
  return apiResponse.success(res, updatedTrip, 'Trip updated successfully.');
});

const deleteTrip = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const existingTrip = await Trip.findById(id);
  if (!existingTrip) {
    return apiResponse.error(res, 'Trip not found.', 404);
  }

  if (existingTrip.status === 'Dispatched') {
    return apiResponse.error(res, 'Cannot delete an ongoing (Dispatched) trip. Complete or cancel it first.', 400);
  }

  const deletedTrip = await Trip.delete(id);
  return apiResponse.success(res, deletedTrip, 'Trip deleted successfully.');
});

module.exports = {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip
};
