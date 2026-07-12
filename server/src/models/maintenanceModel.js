const { query } = require('../config/db');

const Maintenance = {
  create: async ({ vehicle_id, description, cost = 0.00, start_date, end_date = null, status = 'Active' }) => {
    const sql = `
      INSERT INTO maintenance_logs (vehicle_id, description, cost, start_date, end_date, status)
      VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5, $6)
      RETURNING *;
    `;
    const result = await query(sql, [vehicle_id, description, cost, start_date, end_date, status]);
    return result.rows[0];
  },

  findAll: async ({ status, vehicle_id } = {}) => {
    let sql = `
      SELECT m.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM maintenance_logs m
      LEFT JOIN vehicles v ON m.vehicle_id = v.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND m.status = $${paramIndex++}`;
      values.push(status);
    }
    if (vehicle_id) {
      sql += ` AND m.vehicle_id = $${paramIndex++}`;
      values.push(vehicle_id);
    }
    
    sql += ` ORDER BY m.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT m.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM maintenance_logs m
      LEFT JOIN vehicles v ON m.vehicle_id = v.id
      WHERE m.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['description', 'cost', 'start_date', 'end_date', 'status'];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const sql = `
      UPDATE maintenance_logs
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *;
    `;
    
    const result = await query(sql, values);
    return result.rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM maintenance_logs WHERE id = $1 RETURNING *;`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }
};

module.exports = Maintenance;
