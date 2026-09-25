const Vehicle = require('../models/vehicleModel');
const { query } = require('../config/db');
const { normalizeIndianNumberPlate } = require('../utils/numberPlate');

class VehicleServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'VehicleServiceError';
    this.statusCode = statusCode;
  }
}

const vehicleService = {
  /**
   * List vehicles strictly scoped to user's organization with optional filters.
   */
  listVehicles: async (filters = {}, user) => {
    let { status, type, size, sub_category, search } = filters;

    // Normalize frontend status labels to database values
    if (status) {
      if (status === 'Maintenance' || status === 'In shop' || status === 'In Shop') status = 'In Shop';
      else if (status === 'On trip' || status === 'On Trip') status = 'On Trip';
      else if (status === 'All Statuses') status = undefined;
    }
    if (type === 'All Types') type = undefined;
    if (size === 'All Sizes') size = undefined;

    let vehicles = await Vehicle.findAll({
      status,
      type,
      size,
      sub_category,
      organization_id: user.organization_id
    });

    // Optional client-side search query over number plate or type
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      vehicles = vehicles.filter(v => 
        (v.registration_number && v.registration_number.toLowerCase().includes(q)) ||
        (v.name && v.name.toLowerCase().includes(q)) ||
        (v.type && v.type.toLowerCase().includes(q))
      );
    }

    return vehicles;
  },

  /**
   * Get single vehicle by ID, scoped to user's organization.
   */
  getVehicleById: async (id, user) => {
    const vehicle = await Vehicle.findById(id, user.organization_id);
    if (!vehicle) {
      throw new VehicleServiceError('Vehicle not found.', 404);
    }
    return vehicle;
  },

  /**
   * Create a new vehicle with Indian number plate validation and uniqueness check.
   */
  createVehicle: async (data, user) => {
    const rawPlate = (data.numberPlate || data.number_plate || data.registration_number || data.name || '').trim().toUpperCase();
    if (!rawPlate) {
      throw new VehicleServiceError('Number plate is required.', 400);
    }

    const plate = normalizeIndianNumberPlate(rawPlate);
    if (!plate) {
      throw new VehicleServiceError(
        'Invalid number plate format. Must follow standard Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234).',
        400
      );
    }

    // Check uniqueness within the organization
    const existing = await Vehicle.findByRegistration(plate, user.organization_id);
    if (existing) {
      throw new VehicleServiceError(`Vehicle with number plate '${plate}' already exists in your organization.`, 409);
    }

    const type = (data.type || data.customType || 'Truck').trim();
    const size = (data.size || data.sub_category || data.region || 'Standard').trim();

    // Distance covered / Odometer validation
    const rawDistance = data.distanceCovered ?? data.distance_covered ?? data.odometer ?? 0;
    const odometer = parseFloat(rawDistance) || 0;
    if (odometer < 0) {
      throw new VehicleServiceError('Distance covered must be 0 or a positive number.', 400);
    }

    const maxLoadCapacity = parseFloat(data.max_load_capacity) || 1000.00;

    const newVehicle = await Vehicle.create({
      registration_number: plate,
      name: plate,
      type,
      sub_category: size,
      region: size,
      max_load_capacity: maxLoadCapacity,
      odometer,
      status: 'Available',
      organization_id: user.organization_id
    });

    return newVehicle;
  },

  /**
   * Update vehicle fields (odometer, status, size, type, plate) with tenant isolation.
   */
  updateVehicle: async (id, data, user) => {
    const current = await Vehicle.findById(id, user.organization_id);
    if (!current) {
      throw new VehicleServiceError('Vehicle not found.', 404);
    }

    const updatePayload = { ...data };

    // Number plate uniqueness check if changing
    const rawNewPlate = (data.numberPlate || data.number_plate || data.registration_number)?.trim()?.toUpperCase();
    if (rawNewPlate) {
      const newPlate = normalizeIndianNumberPlate(rawNewPlate);
      if (!newPlate) {
        throw new VehicleServiceError(
          'Invalid number plate format. Must follow standard Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234).',
          400
        );
      }
      if (newPlate !== current.registration_number) {
        const duplicate = await Vehicle.findByRegistration(newPlate, user.organization_id, id);
        if (duplicate) {
          throw new VehicleServiceError(`Number plate '${newPlate}' is already in use by another vehicle.`, 409);
        }
        updatePayload.registration_number = newPlate;
        updatePayload.name = newPlate;
      }
    }

    // Distance covered / Odometer validation if updating
    const rawDistance = data.distanceCovered ?? data.distance_covered ?? data.odometer;
    if (rawDistance !== undefined) {
      const parsed = parseFloat(rawDistance);
      if (isNaN(parsed) || parsed < 0) {
        throw new VehicleServiceError('Distance covered must be a valid non-negative number.', 400);
      }
      updatePayload.odometer = parsed;
    }

    // Status normalization & validation
    if (data.status !== undefined) {
      let targetStatus = data.status;
      if (targetStatus === 'Maintenance' || targetStatus === 'In shop' || targetStatus === 'In Shop') {
        targetStatus = 'In Shop';
      } else if (targetStatus === 'On trip' || targetStatus === 'On Trip') {
        targetStatus = 'On Trip';
      }

      const allowedStatuses = ['Available', 'On Trip', 'In Shop', 'Retired'];
      if (!allowedStatuses.includes(targetStatus)) {
        throw new VehicleServiceError(`Invalid vehicle status '${data.status}'. Allowed: Available, Maintenance, Retired.`, 400);
      }

      // Vehicle cannot be manually moved to 'On Trip' (managed automatically by trip dispatch)
      if (targetStatus === 'On Trip' && current.status !== 'On Trip') {
        throw new VehicleServiceError('Vehicle status cannot be manually set to "On Trip". "On Trip" status is managed automatically by trip dispatch.', 400);
      }

      // If vehicle is currently On Trip, prevent manual override to Available or In Shop
      if (current.status === 'On Trip' && targetStatus !== 'On Trip') {
        throw new VehicleServiceError('Cannot manually change status of a vehicle currently On Trip. Complete or cancel its active trip first.', 400);
      }

      updatePayload.status = targetStatus;
    }

    // Size / sub_category mapping
    if (data.size !== undefined && data.sub_category === undefined) {
      updatePayload.sub_category = data.size;
      updatePayload.region = data.size;
    }

    const updated = await Vehicle.update(id, updatePayload, user.organization_id);
    return updated;
  },

  /**
   * Update vehicle status specifically.
   */
  updateVehicleStatus: async (id, status, user) => {
    return vehicleService.updateVehicle(id, { status }, user);
  },

  /**
   * Delete vehicle if not on trip and not engaged in active operations.
   */
  deleteVehicle: async (id, user) => {
    const current = await Vehicle.findById(id, user.organization_id);
    if (!current) {
      throw new VehicleServiceError('Vehicle not found.', 404);
    }

    if (current.status === 'On Trip') {
      throw new VehicleServiceError('Cannot delete a vehicle currently On Trip.', 400);
    }

    // Verify no active trips are assigned or dispatched to this vehicle
    const activeCheck = await query(
      "SELECT id, status FROM trips WHERE vehicle_id = $1 AND organization_id = $2 AND status IN ('Assigned', 'Dispatched') LIMIT 1",
      [id, user.organization_id]
    );
    if (activeCheck.rows.length > 0) {
      throw new VehicleServiceError(`Cannot delete vehicle assigned to active Trip #${activeCheck.rows[0].id} (${activeCheck.rows[0].status}).`, 400);
    }

    const deleted = await Vehicle.delete(id, user.organization_id);
    return deleted;
  }
};

module.exports = {
  vehicleService,
  VehicleServiceError
};
