const { query } = require('../config/db');

function assertOrganizationId(orgId, methodName) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`organization_id is mandatory for Location.${methodName}`);
  }
}

const Location = {
  /**
   * Insert a new vehicle location entry scoped strictly to an organization.
   */
  create: async ({
    trip_id,
    vehicle_id,
    driver_id,
    organization_id,
    latitude,
    longitude,
    speed = null,
    heading = null,
    accuracy = null,
    altitude = null,
    battery_level = null,
    is_offline_sync = false,
    geofence_status = 'IN_TRANSIT',
    captured_at = new Date()
  }) => {
    assertOrganizationId(organization_id, 'create');

    const sql = `
      INSERT INTO vehicle_locations (
        trip_id,
        vehicle_id,
        driver_id,
        organization_id,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        altitude,
        battery_level,
        is_offline_sync,
        geofence_status,
        captured_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `;

    const values = [
      trip_id,
      vehicle_id,
      driver_id,
      organization_id,
      latitude,
      longitude,
      speed,
      heading,
      accuracy,
      altitude,
      battery_level,
      is_offline_sync,
      geofence_status,
      captured_at
    ];

    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Insert a batch of vehicle location entries (e.g. from an offline sync buffer).
   */
  createBatch: async (pings, organization_id) => {
    assertOrganizationId(organization_id, 'createBatch');
    if (!Array.isArray(pings) || pings.length === 0) return [];

    const valueClauses = [];
    const values = [];
    let idx = 1;

    for (const p of pings) {
      valueClauses.push(`(
        $${idx++}, $${idx++}, $${idx++}, $${idx++},
        $${idx++}, $${idx++}, $${idx++}, $${idx++},
        $${idx++}, $${idx++}, $${idx++}, $${idx++},
        $${idx++}, $${idx++}
      )`);
      values.push(
        p.trip_id,
        p.vehicle_id,
        p.driver_id,
        organization_id,
        p.latitude,
        p.longitude,
        p.speed ?? null,
        p.heading ?? null,
        p.accuracy ?? null,
        p.altitude ?? null,
        p.battery_level ?? null,
        p.is_offline_sync ?? true,
        p.geofence_status ?? 'IN_TRANSIT',
        p.captured_at || new Date()
      );
    }

    const sql = `
      INSERT INTO vehicle_locations (
        trip_id,
        vehicle_id,
        driver_id,
        organization_id,
        latitude,
        longitude,
        speed,
        heading,
        accuracy,
        altitude,
        battery_level,
        is_offline_sync,
        geofence_status,
        captured_at
      ) VALUES ${valueClauses.join(', ')}
      RETURNING *
    `;

    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Retrieve the latest known locations for all active (Dispatched) trips in an organization.
   * If a trip is dispatched but has not sent GPS yet, it is still included with null location fields.
   */
  getLatestActiveLocations: async (organization_id) => {
    assertOrganizationId(organization_id, 'getLatestActiveLocations');

    const sql = `
      WITH latest_loc AS (
        SELECT DISTINCT ON (trip_id)
          id AS location_id,
          trip_id,
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          altitude,
          battery_level,
          is_offline_sync,
          geofence_status,
          captured_at,
          created_at AS location_created_at
        FROM vehicle_locations
        WHERE organization_id = $1
        ORDER BY trip_id, captured_at DESC
      )
      SELECT 
        t.id AS trip_id,
        t.status AS trip_status,
        t.origin,
        t.destination,
        t.origin_lat,
        t.origin_lng,
        t.dest_lat,
        t.dest_lng,
        t.arrived_pickup_at,
        t.departed_pickup_at,
        t.arrived_dest_at,
        t.loaded_at,
        t.unloaded_at,
        t.planned_route,
        t.start_time,
        t.expected_arrival,
        t.actual_arrival,
        t.cargo_weight,
        v.id AS vehicle_id,
        v.registration_number AS vehicle_registration,
        v.registration_number AS vehicle_name,
        v.type AS vehicle_type,
        d.id AS driver_id,
        d.name AS driver_name,
        d.contact_number AS driver_phone,
        d.punctuality_score AS driver_punctuality_score,
        d.on_time_rate AS driver_on_time_rate,
        ll.location_id,
        ll.latitude,
        ll.longitude,
        ll.speed,
        ll.heading,
        ll.accuracy,
        ll.altitude,
        ll.battery_level,
        ll.is_offline_sync,
        ll.geofence_status,
        ll.captured_at
      FROM trips t
      LEFT JOIN latest_loc ll ON ll.trip_id = t.id
      LEFT JOIN vehicles v ON v.id = t.vehicle_id
      LEFT JOIN drivers d ON d.id = t.driver_id
      WHERE t.organization_id = $1 AND t.status = 'Dispatched'
      ORDER BY t.start_time DESC
    `;

    const result = await query(sql, [organization_id]);
    return result.rows;
  },

  /**
   * Retrieve chronological GPS trail for a specific trip, scoped by organization.
   */
  getTripHistory: async (trip_id, organization_id, limit = 500) => {
    assertOrganizationId(organization_id, 'getTripHistory');

    const sql = `
      SELECT 
        vl.id,
        vl.trip_id,
        vl.vehicle_id,
        vl.driver_id,
        vl.organization_id,
        vl.latitude,
        vl.longitude,
        vl.speed,
        vl.heading,
        vl.accuracy,
        vl.altitude,
        vl.battery_level,
        vl.is_offline_sync,
        vl.geofence_status,
        vl.captured_at,
        vl.created_at
      FROM vehicle_locations vl
      WHERE vl.trip_id = $1 AND vl.organization_id = $2
      ORDER BY vl.captured_at ASC
      LIMIT $3
    `;

    const result = await query(sql, [trip_id, organization_id, limit]);
    return result.rows;
  },

  /**
   * Get the single latest location point for a trip.
   */
  getLatestByTripId: async (trip_id, organization_id) => {
    assertOrganizationId(organization_id, 'getLatestByTripId');

    const sql = `
      SELECT *
      FROM vehicle_locations
      WHERE trip_id = $1 AND organization_id = $2
      ORDER BY captured_at DESC
      LIMIT 1
    `;

    const result = await query(sql, [trip_id, organization_id]);
    return result.rows[0] || null;
  }
};

module.exports = Location;
