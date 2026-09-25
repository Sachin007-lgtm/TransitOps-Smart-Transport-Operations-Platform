const { query } = require('../config/db');

function assertOrganizationId(orgId, methodName) {
  if (!orgId || typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`organization_id is mandatory for Driver.${methodName}`);
  }
}

const Driver = {
  /**
   * Return all drivers scoped strictly by organization_id with optional filters: status, license_category.
   */
  findAll: async ({ status, license_category, organization_id } = {}) => {
    assertOrganizationId(organization_id, 'findAll');

    let sql = `
      SELECT d.*, u.id AS user_id, u.must_change_password,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id AND t.status = 'Completed'), 0)::int AS trips_count
      FROM drivers d
      LEFT JOIN users u ON u.driver_id = d.id AND u.organization_id = d.organization_id
      WHERE d.organization_id = $1
    `;
    const values = [organization_id];
    let idx = 2;

    if (status) {
      sql += ` AND d.status = $${idx++}`;
      values.push(status);
    }
    if (license_category) {
      sql += ` AND d.license_category = $${idx++}`;
      values.push(license_category);
    }

    sql += ` ORDER BY d.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Find a single driver by PK, scoped strictly by organization_id.
   */
  findById: async (id, organization_id) => {
    assertOrganizationId(organization_id, 'findById');

    const result = await query(`
      SELECT d.*, u.id AS user_id, u.must_change_password,
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id AND t.status = 'Completed'), 0)::int AS trips_count
      FROM drivers d
      LEFT JOIN users u ON u.driver_id = d.id AND u.organization_id = d.organization_id
      WHERE d.id = $1 AND d.organization_id = $2
    `, [id, organization_id]);
    return result.rows[0];
  },

  /**
   * Find a single driver within an active transaction client, scoped strictly by organization_id.
   */
  findByIdWithClient: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'findByIdWithClient');

    const result = await client.query(`
      SELECT d.*, 
             COALESCE((SELECT COUNT(*) FROM trips t WHERE t.driver_id = d.id AND t.status = 'Completed'), 0)::int AS trips_count
      FROM drivers d 
      WHERE d.id = $1 AND d.organization_id = $2
    `, [id, organization_id]);
    return result.rows[0];
  },

  /**
   * Lock and fetch a single driver row for update within an active transaction, scoped strictly by organization_id.
   * Prevents race conditions and cross-tenant double assignments.
   */
  findByIdForUpdate: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'findByIdForUpdate');

    const result = await client.query(
      'SELECT * FROM drivers WHERE id = $1 AND organization_id = $2 FOR UPDATE',
      [id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Check uniqueness of license_number, optionally excluding a driver id (for updates).
   */
  findByLicense: async (license_number, excludeId = null, organization_id = null) => {
    let sql = `SELECT id FROM drivers WHERE license_number = $1`;
    const values = [license_number];
    let idx = 2;

    if (excludeId) {
      sql += ` AND id <> $${idx++}`;
      values.push(excludeId);
    }
    if (organization_id) {
      sql += ` AND organization_id = $${idx++}`;
      values.push(organization_id);
    }

    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Create a new driver. organization_id is mandatory and has NO default fallback.
   */
  create: async ({
    name,
    license_number,
    license_category = 'LMV',
    license_expiry_date,
    contact_number,
    safety_score = 100,
    status = 'Available',
    organization_id
  }, client = { query }) => {
    assertOrganizationId(organization_id, 'create');

    const sql = `
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status, organization_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const result = await client.query(sql, [name, license_number, license_category, license_expiry_date, contact_number, safety_score, status, organization_id]);
    return result.rows[0];
  },

  /**
   * Update allowed fields on a driver, strictly scoped by organization_id.
   */
  update: async (id, fields, organization_id) => {
    assertOrganizationId(organization_id, 'update');

    const allowedFields = ['name', 'license_number', 'license_category', 'license_expiry_date', 'contact_number', 'safety_score', 'status'];
    const setClause = [];
    const values = [];
    let idx = 1;

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${idx++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const idParam = idx++;
    values.push(organization_id);
    const orgParam = idx++;

    const sql = `
      UPDATE drivers
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND organization_id = $${orgParam}
      RETURNING *;
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Delete a driver by PK, strictly scoped by organization_id.
   */
  delete: async (id, organization_id, client = null) => {
    assertOrganizationId(organization_id, 'delete');
    const executor = client || { query };
    const result = await executor.query(`DELETE FROM drivers WHERE id = $1 AND organization_id = $2 RETURNING *`, [id, organization_id]);
    return result.rows[0];
  },

  /**
   * Directly update only the status field, strictly scoped by organization_id.
   */
  setStatus: async (id, status, organization_id, client = null) => {
    assertOrganizationId(organization_id, 'setStatus');
    const executor = client || { query };
    const result = await executor.query(
      `UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [status, id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Update driver status within an active transaction client, strictly scoped by organization_id.
   */
  setStatusWithClient: async (client, id, status, organization_id) => {
    assertOrganizationId(organization_id, 'setStatusWithClient');

    const result = await client.query(
      `UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND organization_id = $3 RETURNING *`,
      [status, id, organization_id]
    );
    return result.rows[0];
  },

  /**
   * Conditionally restore driver to 'Available' only if currently 'On Trip', strictly scoped by organization_id.
   * Prevents overwriting independent states like 'Suspended' or 'Off Duty'.
   */
  releaseIfOnTrip: async (client, id, organization_id) => {
    assertOrganizationId(organization_id, 'releaseIfOnTrip');

    const result = await client.query(
      `UPDATE drivers 
       SET status = 'Available', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND organization_id = $2 AND status = 'On Trip' 
       RETURNING *`,
      [id, organization_id]
    );
    return result.rows[0];
  }
};

module.exports = Driver;
