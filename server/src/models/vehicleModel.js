const { query } = require('../config/db');

const Vehicle = {
  /**
   * Find a single vehicle by PK using default pool.
   */
  findById: async (id) => {
    const result = await query('SELECT * FROM vehicles WHERE id = $1', [id]);
    return result.rows[0];
  },

  /**
   * Find a single vehicle within an explicit database client (transaction).
   */
  findByIdWithClient: async (client, id) => {
    const result = await client.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    return result.rows[0];
  },

  /**
   * Lock and fetch a single vehicle row for update within an active transaction.
   * Prevents race conditions and double assignments.
   */
  findByIdForUpdate: async (client, id) => {
    const result = await client.query('SELECT * FROM vehicles WHERE id = $1 FOR UPDATE', [id]);
    return result.rows[0];
  },

  /**
   * Update vehicle status within an active transaction.
   */
  setStatusWithClient: async (client, id, status) => {
    const result = await client.query(
      'UPDATE vehicles SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  },

  /**
   * Conditionally restore vehicle to 'Available' only if it is currently 'On Trip'.
   * Prevents overwriting independent states like 'In Shop' or 'Retired'.
   */
  releaseIfOnTrip: async (client, id) => {
    const result = await client.query(
      `UPDATE vehicles 
       SET status = 'Available', updated_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND status = 'On Trip' 
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Return vehicles with optional filtering.
   */
  findAll: async ({ status, type, region, organization_id } = {}) => {
    let sql = 'SELECT * FROM vehicles WHERE 1=1';
    const values = [];
    let idx = 1;

    if (organization_id) {
      sql += ` AND organization_id = $${idx++}`;
      values.push(organization_id);
    }
    if (status) {
      sql += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (type) {
      sql += ` AND type = $${idx++}`;
      values.push(type);
    }
    if (region) {
      sql += ` AND region = $${idx++}`;
      values.push(region);
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Update vehicle status using default pool.
   */
  setStatus: async (id, status) => {
    const result = await query(
      'UPDATE vehicles SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }
};

module.exports = Vehicle;
