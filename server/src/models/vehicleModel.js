const { query } = require('../config/db');

function assertOrganizationId(orgId, methodName) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`organization_id is mandatory for Vehicle.${methodName}`);
  }
}

const Vehicle = {
  /**
   * Return all vehicles strictly scoped by organization_id with optional filters
   * and dynamically computed trips_count from Completed trips.
   */
  findAll: async ({ status, type, region, sub_category, size, organization_id } = {}) => {
    assertOrganizationId(organization_id, 'findAll');

    let sql = `
      SELECT v.*,
             v.registration_number AS number_plate,
             COALESCE(v.sub_category, v.region, 'Standard') AS size,
             v.odometer AS distance_covered,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_count,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_completed
      FROM vehicles v
      WHERE v.organization_id = $1
    `;
    const values = [organization_id];
    let idx = 2;

    if (status) {
      sql += ` AND v.status = $${idx++}`;
      values.push(status);
    }
    if (type) {
      sql += ` AND v.type = $${idx++}`;
      values.push(type);
    }
    if (region) {
      sql += ` AND v.region = $${idx++}`;
      values.push(region);
    }
    const resolvedSize = sub_category || size;
    if (resolvedSize) {
      sql += ` AND (v.sub_category = $${idx} OR v.region = $${idx})`;
      values.push(resolvedSize);
      idx++;
    }

    sql += ' ORDER BY v.created_at DESC';
    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Find a single vehicle by PK, strictly scoped by organization_id,
   * including dynamically computed trips_count.
   */
  findById: async (id, organization_id) => {
    assertOrganizationId(organization_id, 'findById');

    const result = await query(`
      SELECT v.*,
             v.registration_number AS number_plate,
             COALESCE(v.sub_category, v.region, 'Standard') AS size,
             v.odometer AS distance_covered,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_count,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_completed
      FROM vehicles v
      WHERE v.id = $1 AND v.organization_id = $2
    `, [id, organization_id]);
    return result.rows[0];
  },

  /**
   * Find a single vehicle within an active transaction client, strictly scoped by organization_id,
   * including dynamically computed trips_count.
   */
  findByIdWithClient: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'findByIdWithClient');

    const result = await client.query(`
      SELECT v.*,
             v.registration_number AS number_plate,
             COALESCE(v.sub_category, v.region, 'Standard') AS size,
             v.odometer AS distance_covered,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_count,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.vehicle_id = v.id AND t.organization_id = v.organization_id AND t.status = 'Completed'), 0)::int AS trips_completed
      FROM vehicles v
      WHERE v.id = $1 AND v.organization_id = $2
    `, [id, organization_id]);
    return result.rows[0];
  },

  /**
   * Lock and fetch a single vehicle row for update within an active transaction,
   * strictly scoped by organization_id to prevent cross-tenant locking and double assignments.
   */
  findByIdForUpdate: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'findByIdForUpdate');

    const result = await client.query(
      'SELECT * FROM vehicles WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Check registration_number lookup strictly scoped by organization_id,
   * optionally excluding an existing vehicle id (for update uniqueness checks).
   * organization_id is strictly mandatory to prevent cross-tenant enumeration.
   */
  findByRegistration: async (registration_number, organization_id, excludeId = null) => {
    assertOrganizationId(organization_id, 'findByRegistration');

    let sql = 'SELECT id, registration_number, organization_id FROM vehicles WHERE registration_number = $1 AND organization_id = $2';
    const values = [registration_number, organization_id];
    let idx = 3;

    if (excludeId) {
      sql += ` AND id <> $${idx++}`;
      values.push(excludeId);
    }

    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Create a new vehicle. organization_id is mandatory and has NO default fallback.
   */
  create: async ({
    registration_number,
    numberPlate,
    number_plate,
    name,
    type,
    sub_category = null,
    size = null,
    max_load_capacity = 1000.00,
    odometer = 0.00,
    distanceCovered = null,
    distance_covered = null,
    acquisition_cost = 0.00,
    status = 'Available',
    region = null,
    organization_id
  }) => {
    assertOrganizationId(organization_id, 'create');

    const regNum = (registration_number || numberPlate || number_plate || name || '').trim().toUpperCase();
    const resolvedName = (name || regNum).trim();
    const resolvedSize = sub_category || size || region || 'Standard';
    const resolvedOdometer = parseFloat(odometer ?? distanceCovered ?? distance_covered ?? 0) || 0.00;
    const resolvedCapacity = parseFloat(max_load_capacity) || 1000.00;

    const sql = `
      INSERT INTO vehicles (
        registration_number, name, type, sub_category, max_load_capacity,
        odometer, acquisition_cost, status, region, organization_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *,
        registration_number AS number_plate,
        COALESCE(sub_category, region, 'Standard') AS size,
        odometer AS distance_covered,
        0 AS trips_count,
        0 AS trips_completed;
    `;
    const values = [
      regNum,
      resolvedName,
      type,
      resolvedSize,
      resolvedCapacity,
      resolvedOdometer,
      acquisition_cost,
      status,
      region || resolvedSize,
      organization_id
    ];
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Update allowed fields on a vehicle, strictly scoped by organization_id.
   */
  update: async (id, fields, organization_id) => {
    assertOrganizationId(organization_id, 'update');

    const normalizedFields = { ...fields };
    if (fields.number_plate !== undefined && fields.registration_number === undefined) {
      normalizedFields.registration_number = fields.number_plate;
    }
    if (fields.numberPlate !== undefined && fields.registration_number === undefined) {
      normalizedFields.registration_number = fields.numberPlate;
    }
    if (fields.size !== undefined && fields.sub_category === undefined) {
      normalizedFields.sub_category = fields.size;
    }
    if (fields.distance_covered !== undefined && fields.odometer === undefined) {
      normalizedFields.odometer = fields.distance_covered;
    }
    if (fields.distanceCovered !== undefined && fields.odometer === undefined) {
      normalizedFields.odometer = fields.distanceCovered;
    }

    const allowedFields = [
      'registration_number',
      'name',
      'type',
      'sub_category',
      'max_load_capacity',
      'odometer',
      'acquisition_cost',
      'status',
      'region'
    ];
    const setClause = [];
    const values = [];
    let idx = 1;

    for (const key of allowedFields) {
      if (normalizedFields[key] !== undefined) {
        setClause.push(`${key} = $${idx++}`);
        values.push(normalizedFields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const idParam = idx++;
    values.push(organization_id);
    const orgParam = idx++;

    const sql = `
      UPDATE vehicles
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND organization_id = $${orgParam}
      RETURNING *,
        registration_number AS number_plate,
        COALESCE(sub_category, region, 'Standard') AS size,
        odometer AS distance_covered;
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Delete a vehicle by PK, strictly scoped by organization_id.
   */
  delete: async (id, organization_id) => {
    assertOrganizationId(organization_id, 'delete');

    const result = await query(
      'DELETE FROM vehicles WHERE id = $1 AND organization_id = $2 RETURNING *',
      [id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Update vehicle status using default pool, strictly scoped by organization_id.
   */
  setStatus: async (id, status, organization_id) => {
    assertOrganizationId(organization_id, 'setStatus');

    const result = await query(
      `UPDATE vehicles 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND organization_id = $3 
       RETURNING *,
         registration_number AS number_plate,
         COALESCE(sub_category, region, 'Standard') AS size,
         odometer AS distance_covered`,
      [status, id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Update vehicle status within an active transaction client, strictly scoped by organization_id.
   */
  setStatusWithClient: async (client, id, status, organization_id) => {
    assertOrganizationId(organization_id, 'setStatusWithClient');

    const result = await client.query(
      `UPDATE vehicles 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND organization_id = $3 
       RETURNING *,
         registration_number AS number_plate,
         COALESCE(sub_category, region, 'Standard') AS size,
         odometer AS distance_covered`,
      [status, id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Conditionally restore vehicle to 'Available' only if currently 'On Trip', strictly scoped by organization_id.
   * Prevents overwriting independent states like 'In Shop' or 'Retired'.
   */
  releaseIfOnTrip: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'releaseIfOnTrip');

    const result = await client.query(
      `UPDATE vehicles 
       SET status = 'Available', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND organization_id = $2 AND status = 'On Trip' 
       RETURNING *,
         registration_number AS number_plate,
         COALESCE(sub_category, region, 'Standard') AS size,
         odometer AS distance_covered`,
      [id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Atomically increment a vehicle's odometer (lifetime distance) by completed trip distance.
   */
  incrementOdometer: async (client, id, distance, organization_id) => {
    assertOrganizationId(organization_id, 'incrementOdometer');
    const distNum = parseFloat(distance) || 0;
    if (distNum <= 0) return null;

    const result = await client.query(
      `UPDATE vehicles 
       SET odometer = odometer + $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 AND organization_id = $3 
       RETURNING *,
         registration_number AS number_plate,
         COALESCE(sub_category, region, 'Standard') AS size,
         odometer AS distance_covered`,
      [distNum, id, organization_id]
    );
    return result.rows[0];
  }
};

module.exports = Vehicle;
