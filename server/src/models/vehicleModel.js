const { query } = require('../config/db');

const Vehicle = {
  /**
   * Return all vehicles with optional filters: status, type.
   */
  findAll: async ({ status, type } = {}) => {
    let sql = `SELECT * FROM vehicles WHERE 1=1`;
    const values = [];
    let idx = 1;

    if (status) {
      sql += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (type) {
      sql += ` AND type = $${idx++}`;
      values.push(type);
    }

    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Find a single vehicle by PK.
   */
  findById: async (id) => {
    const result = await query(`SELECT * FROM vehicles WHERE id = $1`, [id]);
    return result.rows[0];
  },

  /**
   * Check uniqueness of registration_number, optionally excluding a vehicle id (for updates).
   */
  findByRegistration: async (registration_number, excludeId = null) => {
    let sql = `SELECT id FROM vehicles WHERE registration_number = $1`;
    const values = [registration_number];
    if (excludeId) {
      sql += ` AND id <> $2`;
      values.push(excludeId);
    }
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Create a new vehicle.
   */
  create: async ({ registration_number, name, type, max_load_capacity, odometer = 0, acquisition_cost = 0, status = 'Available', region = null }) => {
    const sql = `
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const result = await query(sql, [registration_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region]);
    return result.rows[0];
  },

  /**
   * Update allowed fields on a vehicle.
   */
  update: async (id, fields) => {
    const allowedFields = ['name', 'type', 'max_load_capacity', 'odometer', 'acquisition_cost', 'status', 'registration_number', 'region'];
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
    const sql = `
      UPDATE vehicles
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
      RETURNING *;
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Delete a vehicle by PK.
   */
  delete: async (id) => {
    const result = await query(`DELETE FROM vehicles WHERE id = $1 RETURNING *`, [id]);
    return result.rows[0];
  },

  /**
   * Directly update only the status field (used by trip & maintenance workflows).
   */
  setStatus: async (id, status) => {
    const result = await query(
      `UPDATE vehicles SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }
};

module.exports = Vehicle;
