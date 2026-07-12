const { query } = require('../config/db');

const Driver = {
  /**
   * Return all drivers with optional filters: status, license_category.
   */
  findAll: async ({ status, license_category } = {}) => {
    let sql = `SELECT * FROM drivers WHERE 1=1`;
    const values = [];
    let idx = 1;

    if (status) {
      sql += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (license_category) {
      sql += ` AND license_category = $${idx++}`;
      values.push(license_category);
    }

    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Find a single driver by PK.
   */
  findById: async (id) => {
    const result = await query(`SELECT * FROM drivers WHERE id = $1`, [id]);
    return result.rows[0];
  },

  /**
   * Check uniqueness of license_number, optionally excluding a driver id (for updates).
   */
  findByLicense: async (license_number, excludeId = null) => {
    let sql = `SELECT id FROM drivers WHERE license_number = $1`;
    const values = [license_number];
    if (excludeId) {
      sql += ` AND id <> $2`;
      values.push(excludeId);
    }
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Create a new driver.
   */
  create: async ({ name, license_number, license_category, license_expiry_date, contact_number, safety_score = 100, status = 'Available' }) => {
    const sql = `
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `;
    const result = await query(sql, [name, license_number, license_category, license_expiry_date, contact_number, safety_score, status]);
    return result.rows[0];
  },

  /**
   * Update allowed fields on a driver.
   */
  update: async (id, fields) => {
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
    const sql = `
      UPDATE drivers
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
      RETURNING *;
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Delete a driver by PK.
   */
  delete: async (id) => {
    const result = await query(`DELETE FROM drivers WHERE id = $1 RETURNING *`, [id]);
    return result.rows[0];
  },

  /**
   * Directly update only the status field (used by trip workflow).
   */
  setStatus: async (id, status) => {
    const result = await query(
      `UPDATE drivers SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }
};

module.exports = Driver;
