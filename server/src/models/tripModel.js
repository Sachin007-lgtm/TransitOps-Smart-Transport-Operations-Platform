const { query } = require('../config/db');

function assertOrganizationId(orgId, methodName) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`organization_id is mandatory for Trip.${methodName}`);
  }
}

const Trip = {
  /**
   * Create a new Trip.
   * organization_id is strictly mandatory.
   */
  create: async ({
    organization_id,
    external_party_name = null,
    external_party_type = null,
    origin,
    destination,
    planned_route,
    vehicle_id = null,
    driver_id = null,
    cargo_weight = 0.00,
    planned_distance = 0.00,
    revenue = 0.00,
    start_time,
    expected_arrival,
    status = 'Draft'
  }, client = null) => {
    assertOrganizationId(organization_id, 'create');

    const sql = `
      INSERT INTO trips (
        organization_id, external_party_name, external_party_type,
        origin, destination, planned_route,
        vehicle_id, driver_id,
        cargo_weight, planned_distance, revenue,
        start_time, expected_arrival, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *;
    `;
    const values = [
      organization_id,
      external_party_name,
      external_party_type,
      origin,
      destination,
      planned_route,
      vehicle_id,
      driver_id,
      cargo_weight,
      planned_distance,
      revenue,
      start_time,
      expected_arrival,
      status
    ];

    const executor = client || { query };
    const result = await executor.query(sql, values);
    return result.rows[0];
  },

  /**
   * Find a single trip by ID, scoped strictly by organization_id.
   * Includes sanitized vehicle & driver summaries without exposing sensitive driver scores or credentials.
   */
  findById: async (id, organization_id) => {
    assertOrganizationId(organization_id, 'findById');

    const sql = `
      SELECT t.*,
             -- Legacy alias for backwards-compatibility
             t.origin AS source,
             o.name AS organization_name,
             v.registration_number AS vehicle_name,
             v.registration_number AS vehicle_registration,
             v.type AS vehicle_type,
             v.max_load_capacity AS vehicle_capacity,
             v.status AS vehicle_status,
             d.name AS driver_name,
             d.license_number AS driver_license,
             d.contact_number AS driver_contact,
             d.status AS driver_status
      FROM trips t
      LEFT JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.id = $1 AND t.organization_id = $2
    `;
    const values = [id, organization_id];

    const result = await query(sql, values);
    const row = result.rows[0];
    if (!row) return null;

    return Trip._formatTripResponse(row);
  },

  /**
   * Lock and fetch a trip row for update within an active transaction, scoped strictly by organization_id.
   */
  findByIdForUpdate: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'findByIdForUpdate');

    const sql = `SELECT * FROM trips WHERE id = $1 AND organization_id = $2 FOR UPDATE`;
    const values = [id, organization_id];

    const result = await client.query(sql, values);
    return result.rows[0];
  },

  /**
   * Find any active operational trip (Assigned or Dispatched) colliding with the specified
   * vehicle or driver within the organization, excluding a specific trip ID if provided.
   */
  findActiveCollision: async (client, { organization_id, vehicle_id, driver_id, excludeTripId = null }) => {
    assertOrganizationId(organization_id, 'findActiveCollision');

    if (!vehicle_id && !driver_id) {
      return null;
    }

    let sql = `
      SELECT id, vehicle_id, driver_id, status 
      FROM trips 
      WHERE organization_id = $1 
        AND status IN ('Assigned', 'Dispatched')
    `;
    const values = [organization_id];
    let idx = 2;

    if (excludeTripId) {
      sql += ` AND id <> $${idx++}`;
      values.push(excludeTripId);
    }

    const conditions = [];
    if (vehicle_id) {
      conditions.push(`vehicle_id = $${idx++}`);
      values.push(vehicle_id);
    }
    if (driver_id) {
      conditions.push(`driver_id = $${idx++}`);
      values.push(driver_id);
    }

    sql += ` AND (${conditions.join(' OR ')}) ORDER BY id ASC`;

    const executor = client || { query };
    const result = await executor.query(sql, values);
    if (result.rows.length === 0) return null;

    const vehicleCollision = result.rows.find(r => vehicle_id && r.vehicle_id === vehicle_id);
    const driverCollision = result.rows.find(r => driver_id && r.driver_id === driver_id);

    return {
      ...result.rows[0],
      vehicleCollision,
      driverCollision
    };
  },

  /**
   * List trips with mandatory tenant isolation and optional filters.
   */
  findAll: async ({
    organization_id,
    status,
    vehicle_id,
    driver_id,
    external_party_type,
    from_date,
    to_date
  } = {}) => {
    assertOrganizationId(organization_id, 'findAll');

    let sql = `
      SELECT t.*,
             t.origin AS source,
             o.name AS organization_name,
             v.registration_number AS vehicle_name,
             v.registration_number AS vehicle_registration,
             v.type AS vehicle_type,
             v.max_load_capacity AS vehicle_capacity,
             v.status AS vehicle_status,
             d.name AS driver_name,
             d.license_number AS driver_license,
             d.contact_number AS driver_contact,
             d.status AS driver_status
      FROM trips t
      LEFT JOIN organizations o ON t.organization_id = o.id
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.organization_id = $1
    `;
    const values = [organization_id];
    let paramIndex = 2;

    if (status) {
      sql += ` AND t.status = $${paramIndex++}`;
      values.push(status);
    }

    if (vehicle_id) {
      sql += ` AND t.vehicle_id = $${paramIndex++}`;
      values.push(vehicle_id);
    }

    if (driver_id) {
      sql += ` AND t.driver_id = $${paramIndex++}`;
      values.push(driver_id);
    }

    if (external_party_type) {
      sql += ` AND t.external_party_type = $${paramIndex++}`;
      values.push(external_party_type);
    }

    if (from_date) {
      sql += ` AND t.start_time >= $${paramIndex++}`;
      values.push(from_date);
    }

    if (to_date) {
      sql += ` AND t.start_time <= $${paramIndex++}`;
      values.push(to_date);
    }

    sql += ` ORDER BY t.created_at DESC`;

    const result = await query(sql, values);
    return result.rows.map(Trip._formatTripResponse);
  },

  /**
   * Update allowed fields of a Trip within transaction or default pool.
   * organization_id is mandatory to strictly enforce tenant isolation at the query level.
   */
  update: async (id, fields, organization_id, client = null) => {
    assertOrganizationId(organization_id, 'update');

    const allowedFields = [
      'origin',
      'destination',
      'external_party_name',
      'external_party_type',
      'planned_route',
      'vehicle_id',
      'driver_id',
      'cargo_weight',
      'planned_distance',
      'actual_distance',
      'revenue',
      'start_time',
      'expected_arrival',
      'actual_arrival',
      'status'
    ];

    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const idParam = paramIndex++;
    values.push(organization_id);
    const orgParam = paramIndex++;

    const sql = `
      UPDATE trips
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND organization_id = $${orgParam}
      RETURNING *;
    `;

    const executor = client || { query };
    const result = await executor.query(sql, values);
    return result.rows[0];
  },

  /**
   * Delete a trip by ID, strictly scoped by organization_id (restricted to Draft status).
   */
  delete: async (id, organization_id) => {
    assertOrganizationId(organization_id, 'delete');

    const sql = `DELETE FROM trips WHERE id = $1 AND organization_id = $2 RETURNING *;`;
    const values = [id, organization_id];

    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Private helper to format trip row with structured embedded summaries.
   */
  _formatTripResponse: (row) => {
    const {
      vehicle_name,
      vehicle_registration,
      vehicle_type,
      vehicle_capacity,
      vehicle_status,
      driver_name,
      driver_license,
      driver_contact,
      driver_status,
      ...trip
    } = row;

    return {
      ...trip,
      organization_name: row.organization_name || null,
      vehicle: row.vehicle_id
        ? {
            id: row.vehicle_id,
            name: vehicle_name,
            registration_number: vehicle_registration,
            type: vehicle_type,
            max_load_capacity: vehicle_capacity,
            status: vehicle_status
          }
        : null,
      driver: row.driver_id
        ? {
            id: row.driver_id,
            name: driver_name,
            license_number: driver_license,
            contact_number: driver_contact,
            status: driver_status
          }
        : null
    };
  }
};

module.exports = Trip;
