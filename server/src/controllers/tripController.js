const Trip = require('../models/tripModel');
const Vehicle = require('../models/vehicleModel');
const Driver = require('../models/driverModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');
const { query } = require('../config/db');

const createTrip = asyncWrapper(async (req, res) => {
  const { vehicle_id, driver_id, status } = req.body;
  
  // Basic validation that vehicle & driver exist
  const vehicle = await Vehicle.findById(vehicle_id);
  if (!vehicle) {
    return apiResponse.error(res, 'Vehicle not found.', 404);
  }
  
  const driver = await Driver.findById(driver_id);
  if (!driver) {
    return apiResponse.error(res, 'Driver not found.', 404);
  }

  if (status === 'Dispatched' || status === 'Completed') {
     return apiResponse.error(res, 'New trips must be created in Draft status. Dispatch them via update.', 400);
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

  const { status, actual_distance } = req.body;
  
  // State transition logic
  if (status && status !== existingTrip.status) {
    if (status === 'Dispatched') {
      // Check if vehicle and driver are Available
      const vehicle = await Vehicle.findById(existingTrip.vehicle_id);
      const driver = await Driver.findById(existingTrip.driver_id);
      
      if (vehicle.status !== 'Available') {
        return apiResponse.error(res, `Cannot dispatch: Vehicle is currently ${vehicle.status}.`, 400);
      }
      if (driver.status !== 'Available') {
         return apiResponse.error(res, `Cannot dispatch: Driver is currently ${driver.status}.`, 400);
      }
      
      // Update statuses to On Trip
      await Vehicle.setStatus(existingTrip.vehicle_id, 'On Trip');
      await Driver.setStatus(existingTrip.driver_id, 'On Trip');
      
    } else if (status === 'Completed') {
      if (existingTrip.status !== 'Dispatched') {
         return apiResponse.error(res, 'Only Dispatched trips can be marked as Completed.', 400);
      }
      if (!actual_distance && !existingTrip.actual_distance) {
         return apiResponse.error(res, 'actual_distance is required to complete a trip.', 400);
      }
      
      const distanceToAdd = actual_distance || existingTrip.actual_distance;
      
      // Free up vehicle and driver
      await Vehicle.setStatus(existingTrip.vehicle_id, 'Available');
      await Driver.setStatus(existingTrip.driver_id, 'Available');
      
      // Update vehicle odometer
      await query('UPDATE vehicles SET odometer = odometer + $1 WHERE id = $2', [distanceToAdd, existingTrip.vehicle_id]);
      
    } else if (status === 'Cancelled') {
       if (existingTrip.status === 'Dispatched') {
         // Free up vehicle and driver
         await Vehicle.setStatus(existingTrip.vehicle_id, 'Available');
         await Driver.setStatus(existingTrip.driver_id, 'Available');
       }
    }
  }

  const updatedTrip = await Trip.update(id, req.body);
  if (!updatedTrip) {
    return apiResponse.error(res, 'No changes made.', 400);
  }
  return apiResponse.success(res, updatedTrip, 'Trip updated successfully.');
});

const deleteTrip = asyncWrapper(async (req, res) => {
  const existingTrip = await Trip.findById(req.params.id);
  if (!existingTrip) {
    return apiResponse.error(res, 'Trip not found.', 404);
  }
  
  if (existingTrip.status === 'Dispatched') {
    return apiResponse.error(res, 'Cannot delete an ongoing trip. Complete or cancel it first.', 400);
  }

  const deletedTrip = await Trip.delete(req.params.id);
  return apiResponse.success(res, deletedTrip, 'Trip deleted successfully.');
});

module.exports = {
  createTrip,
  getAllTrips,
  getTripById,
  updateTrip,
  deleteTrip
};
