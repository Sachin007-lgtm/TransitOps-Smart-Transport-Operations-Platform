const { query } = require('../config/db');

const SELECT_COLUMNS = `
  ac.id, ac.organization_id, ac.trip_id, ac.driver_id, ac.requested_by,
  ac.requested_at, ac.status,
  ac.driver_latitude, ac.driver_longitude, ac.driver_accuracy,
  ac.driver_location_name, ac.driver_claimed_minutes, ac.driver_claimed_eta_text,
  ac.responded_at, ac.expires_at,
  ac.pickup_latitude, ac.pickup_longitude,
  ac.road_distance_km, ac.system_eta_minutes, ac.eta_gap_minutes,
  ac.decision_recommendation, ac.notes, ac.created_at, ac.updated_at,
  d.name AS driver_name, d.phone AS driver_phone, d.status AS driver_status,
  d.license_no AS driver_license, d.license_category,
  t.origin, t.destination, t.start_time, t.expected_arrival
`;

const BASE_FROM = `
  FROM driver_availability_checks ac
  JOIN drivers d ON d.id = ac.driver_id AND d.organization_id = ac.organization_id
  JOIN trips t ON t.id = ac.trip_id AND t.organization_id = ac.organization_id
`;

const AvailabilityCheck = {
  createRequest: async ({
    organization_id, trip_id, driver_id, requested_by = null,
    pickup_latitude = null, pickup_longitude = null, notes = null
  }) => {
    // If a pending request for this driver on this trip already exists, return it
    const existing = await query(`
      SELECT ${SELECT_COLUMNS} ${BASE_FROM}
      WHERE ac.organization_id = $1 AND ac.trip_id = $2 AND ac.driver_id = $3
        AND ac.status = 'PENDING' AND (ac.expires_at IS NULL OR ac.expires_at > CURRENT_TIMESTAMP)
      LIMIT 1;
    `, [organization_id, trip_id, driver_id]);

    if (existing.rows.length > 0) {
      return existing.rows[0];
    }

    const sql = `
      INSERT INTO driver_availability_checks (
        organization_id, trip_id, driver_id, requested_by,
        pickup_latitude, pickup_longitude, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const result = await query(sql, [
      organization_id, trip_id, driver_id, requested_by,
      pickup_latitude, pickup_longitude, notes
    ]);

    return AvailabilityCheck.findById(result.rows[0].id, organization_id);
  },

  findById: async (id, organization_id) => {
    const sql = `SELECT ${SELECT_COLUMNS} ${BASE_FROM} WHERE ac.id = $1 AND ac.organization_id = $2;`;
    const result = await query(sql, [id, organization_id]);
    return result.rows[0] || null;
  },

  findByTrip: async (trip_id, organization_id) => {
    const sql = `
      SELECT ${SELECT_COLUMNS} ${BASE_FROM}
      WHERE ac.trip_id = $1 AND ac.organization_id = $2
      ORDER BY
        CASE ac.decision_recommendation
          WHEN 'BEST_OPTION' THEN 1
          WHEN 'FEASIBLE' THEN 2
          WHEN 'HIGH_RISK_DELAY' THEN 3
          ELSE 4
        END,
        ac.system_eta_minutes ASC NULLS LAST,
        ac.created_at DESC;
    `;
    const result = await query(sql, [trip_id, organization_id]);
    return result.rows;
  },

  findPendingForDriver: async (driver_id, organization_id) => {
    const sql = `
      SELECT ${SELECT_COLUMNS} ${BASE_FROM}
      WHERE ac.driver_id = $1 AND ac.organization_id = $2
        AND ac.status = 'PENDING'
        AND (ac.expires_at IS NULL OR ac.expires_at > CURRENT_TIMESTAMP)
      ORDER BY ac.requested_at DESC;
    `;
    const result = await query(sql, [driver_id, organization_id]);
    return result.rows;
  },

  respond: async (id, organization_id, {
    driver_latitude, driver_longitude, driver_accuracy = null,
    driver_location_name = null, driver_claimed_minutes = null,
    driver_claimed_eta_text = null, road_distance_km = null,
    system_eta_minutes = null, eta_gap_minutes = null,
    decision_recommendation = 'FEASIBLE'
  }) => {
    const sql = `
      UPDATE driver_availability_checks
      SET
        driver_latitude = $1,
        driver_longitude = $2,
        driver_accuracy = $3,
        driver_location_name = $4,
        driver_claimed_minutes = $5,
        driver_claimed_eta_text = $6,
        road_distance_km = $7,
        system_eta_minutes = $8,
        eta_gap_minutes = $9,
        decision_recommendation = $10,
        status = 'RESPONDED',
        responded_at = CURRENT_TIMESTAMP,
        expires_at = CURRENT_TIMESTAMP + INTERVAL '30 minutes',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $11 AND organization_id = $12
      RETURNING *;
    `;
    await query(sql, [
      driver_latitude, driver_longitude, driver_accuracy,
      driver_location_name, driver_claimed_minutes, driver_claimed_eta_text,
      road_distance_km, system_eta_minutes, eta_gap_minutes,
      decision_recommendation, id, organization_id
    ]);

    return AvailabilityCheck.findById(id, organization_id);
  },

  updateStatus: async (id, organization_id, status) => {
    const sql = `
      UPDATE driver_availability_checks
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organization_id = $3
      RETURNING *;
    `;
    await query(sql, [status, id, organization_id]);
    return AvailabilityCheck.findById(id, organization_id);
  }
};

module.exports = AvailabilityCheck;
