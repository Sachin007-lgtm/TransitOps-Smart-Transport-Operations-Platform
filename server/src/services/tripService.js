const { pool, query } = require('../config/db');
const Trip = require('../models/tripModel');
const Vehicle = require('../models/vehicleModel');
const Driver = require('../models/driverModel');

class TripServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const VALID_TRANSITIONS = {
  Draft: ['Planned', 'Assigned', 'Cancelled'],
  Planned: ['Assigned', 'Cancelled'],
  Assigned: ['Dispatched', 'Cancelled'],
  Dispatched: ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: []
};

const tripService = {
  /**
   * Create a new trip scoped strictly to the authenticated user's organization.
   */
  createTrip: async (tripData, user) => {
    const orgId = user.organization_id;
    const {
      origin,
      destination,
      planned_route,
      vehicle_id,
      driver_id,
      external_party_name,
      external_party_type,
      cargo_weight = 0.00,
      planned_distance = 0.00,
      revenue = 0.00,
      start_time,
      expected_arrival,
      status = 'Draft'
    } = tripData;

    // Validate vehicle if provided
    if (vehicle_id) {
      const vehicle = await Vehicle.findById(vehicle_id);
      if (!vehicle) {
        throw new TripServiceError(`Vehicle with ID ${vehicle_id} not found.`, 404);
      }
      if (vehicle.organization_id !== orgId) {
        throw new TripServiceError(`Vehicle belongs to another organization.`, 400);
      }
      if (vehicle.status !== 'Available') {
        throw new TripServiceError(
          `Vehicle ${vehicle.registration_number} is currently '${vehicle.status}' and unavailable for assignment.`,
          409
        );
      }
    }

    // Validate driver if provided
    if (driver_id) {
      const anyDriver = await query('SELECT organization_id, status, name FROM drivers WHERE id = $1', [driver_id]);
      if (anyDriver.rows.length === 0) {
        throw new TripServiceError(`Driver with ID ${driver_id} not found.`, 404);
      }
      if (anyDriver.rows[0].organization_id !== orgId) {
        throw new TripServiceError(`Driver belongs to another organization.`, 400);
      }
      const driver = await Driver.findById(driver_id, orgId);
      if (driver.status !== 'Available') {
        throw new TripServiceError(
          `Driver ${driver.name} is currently '${driver.status}' and unavailable for assignment.`,
          409
        );
      }
    }

    const created = await Trip.create({
      organization_id: orgId,
      external_party_name,
      external_party_type,
      origin,
      destination,
      planned_route,
      vehicle_id: vehicle_id || null,
      driver_id: driver_id || null,
      cargo_weight,
      planned_distance,
      revenue,
      start_time,
      expected_arrival,
      status
    });

    return await Trip.findById(created.id, orgId);
  },

  /**
   * Retrieve a single trip by ID with tenant and driver RBAC enforcement.
   */
  getTripById: async (id, user) => {
    const trip = await Trip.findById(id, user.organization_id);
    if (!trip) {
      throw new TripServiceError('Trip not found.', 404);
    }

    // If caller is a Driver, restrict strictly to their assigned trip
    if (user.role === 'Driver') {
      if (!user.driver_id || trip.driver_id !== user.driver_id) {
        throw new TripServiceError('Forbidden: Drivers may only access trips assigned to them.', 403);
      }
    }

    return trip;
  },

  /**
   * List trips with tenant isolation and role-based filtering.
   */
  listTrips: async (queryParams, user) => {
    const filters = {
      organization_id: user.organization_id,
      status: queryParams.status,
      vehicle_id: queryParams.vehicle_id ? Number(queryParams.vehicle_id) : undefined,
      driver_id: queryParams.driver_id ? Number(queryParams.driver_id) : undefined,
      external_party_type: queryParams.external_party_type,
      from_date: queryParams.from_date,
      to_date: queryParams.to_date
    };

    // Driver role restriction: can only list own trips
    if (user.role === 'Driver') {
      if (!user.driver_id) {
        return [];
      }
      filters.driver_id = user.driver_id;
    }

    return await Trip.findAll(filters);
  },

  /**
   * Update non-status trip attributes, strictly scoped by tenant.
   */
  updateTrip: async (id, fields, user) => {
    const existing = await Trip.findById(id, user.organization_id);
    if (!existing) {
      throw new TripServiceError('Trip not found.', 404);
    }

    if (existing.status === 'Completed' || existing.status === 'Cancelled') {
      throw new TripServiceError(`Cannot modify a trip that is ${existing.status}.`, 400);
    }

    // Prevent removing vehicle or driver if trip is Assigned or Dispatched
    if ((existing.status === 'Assigned' || existing.status === 'Dispatched')) {
      if (fields.vehicle_id === null || fields.driver_id === null) {
        throw new TripServiceError(`Cannot unassign vehicle or driver while trip is '${existing.status}'.`, 400);
      }
    }

    // Validate new vehicle if changing
    if (fields.vehicle_id && fields.vehicle_id !== existing.vehicle_id) {
      const v = await Vehicle.findById(fields.vehicle_id);
      if (!v) throw new TripServiceError('Vehicle not found.', 404);
      if (v.organization_id !== user.organization_id) {
        throw new TripServiceError('Vehicle belongs to another organization.', 400);
      }
      if (v.status !== 'Available') {
        throw new TripServiceError(`Vehicle is currently '${v.status}' and unavailable.`, 409);
      }
    }

    // Validate new driver if changing
    if (fields.driver_id && fields.driver_id !== existing.driver_id) {
      const anyDriver = await query('SELECT organization_id, status, name FROM drivers WHERE id = $1', [fields.driver_id]);
      if (anyDriver.rows.length === 0) throw new TripServiceError('Driver not found.', 404);
      if (anyDriver.rows[0].organization_id !== user.organization_id) {
        throw new TripServiceError('Driver belongs to another organization.', 400);
      }
      const d = await Driver.findById(fields.driver_id, user.organization_id);
      if (d.status !== 'Available') {
        throw new TripServiceError(`Driver is currently '${d.status}' and unavailable.`, 409);
      }
    }

    const updated = await Trip.update(id, fields, user.organization_id);
    if (!updated) {
      throw new TripServiceError('Trip not found or belongs to another organization.', 404);
    }
    return await Trip.findById(id, user.organization_id);
  },

  /**
   * Atomic Status Transition with Pessimistic Row Locking and Fleet State Coordination.
   */
  updateTripStatus: async (id, { status: nextStatus, actual_arrival, actual_distance }, user) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Lock trip row
      const trip = await Trip.findByIdForUpdate(client, id, user.organization_id);
      if (!trip) {
        throw new TripServiceError('Trip not found.', 404);
      }

      const currentStatus = trip.status;

      // 2. Prevent transitions from terminal states
      if (currentStatus === 'Completed' || currentStatus === 'Cancelled') {
        throw new TripServiceError(`Cannot transition from terminal status '${currentStatus}'.`, 400);
      }

      // 3. Validate transition against state machine
      const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
      if (!allowedNext.includes(nextStatus)) {
        throw new TripServiceError(
          `Invalid status transition from '${currentStatus}' to '${nextStatus}'. Allowed transitions: [${allowedNext.join(', ')}].`,
          400
        );
      }

      // 4. Handle state-specific logic & locks
      if (nextStatus === 'Assigned' || nextStatus === 'Dispatched') {
        if (!trip.vehicle_id || !trip.driver_id) {
          throw new TripServiceError(
            `Cannot transition to '${nextStatus}' without both vehicle and driver assigned.`,
            400
          );
        }

        // Lock vehicle row
        const vehicle = await Vehicle.findByIdForUpdate(client, trip.vehicle_id);
        if (!vehicle || vehicle.organization_id !== user.organization_id) {
          throw new TripServiceError('Assigned vehicle not found or belongs to another organization.', 404);
        }

        // Lock driver row
        const driver = await Driver.findByIdForUpdate(client, trip.driver_id, user.organization_id);
        if (!driver) {
          throw new TripServiceError('Assigned driver not found or belongs to another organization.', 404);
        }

        // Check availability: must be 'Available' or already 'On Trip' for this same trip
        if (currentStatus !== 'Dispatched') {
          if (vehicle.status !== 'Available') {
            throw new TripServiceError(
              `Vehicle ${vehicle.registration_number} is currently '${vehicle.status}' and unavailable.`,
              409
            );
          }
          if (driver.status !== 'Available') {
            throw new TripServiceError(
              `Driver ${driver.name} is currently '${driver.status}' and unavailable.`,
              409
            );
          }
        }

        // If dispatching, atomically mark assets as 'On Trip'
        if (nextStatus === 'Dispatched') {
          await Vehicle.setStatusWithClient(client, trip.vehicle_id, 'On Trip');
          await Driver.setStatusWithClient(client, trip.driver_id, 'On Trip', user.organization_id);
        }
      }

      // 5. If completing, record actual arrival and conditionally restore fleet availability
      const updateFields = { status: nextStatus };

      if (nextStatus === 'Completed') {
        updateFields.actual_arrival = actual_arrival || new Date().toISOString();
        if (actual_distance !== undefined) {
          updateFields.actual_distance = actual_distance;
        }

        if (trip.vehicle_id) {
          await Vehicle.releaseIfOnTrip(client, trip.vehicle_id);
        }
        if (trip.driver_id) {
          await Driver.releaseIfOnTrip(client, trip.driver_id, user.organization_id);
        }
      }

      // 6. If cancelling, conditionally restore fleet availability
      if (nextStatus === 'Cancelled') {
        if (trip.vehicle_id) {
          await Vehicle.releaseIfOnTrip(client, trip.vehicle_id);
        }
        if (trip.driver_id) {
          await Driver.releaseIfOnTrip(client, trip.driver_id, user.organization_id);
        }
      }

      // Update the trip row, scoped strictly by organization_id
      await Trip.update(id, updateFields, user.organization_id, client);

      await client.query('COMMIT');

      // Return refreshed trip with joins
      return await Trip.findById(id, user.organization_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Restrict physical delete strictly to Draft trips.
   */
  deleteTrip: async (id, user) => {
    const trip = await Trip.findById(id, user.organization_id);
    if (!trip) {
      throw new TripServiceError('Trip not found.', 404);
    }

    if (trip.status !== 'Draft') {
      throw new TripServiceError(
        `Operational trips in '${trip.status}' status cannot be physically deleted. Use cancellation (PATCH /trips/:id/status with status: 'Cancelled') instead.`,
        400
      );
    }

    const deleted = await Trip.delete(id, user.organization_id);
    return deleted;
  }
};

module.exports = {
  tripService,
  TripServiceError
};
