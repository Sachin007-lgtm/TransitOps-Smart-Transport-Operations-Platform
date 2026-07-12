const { query } = require('../config/db');

const Fuel = {
  create: async ({ vehicle_id, trip_id = null, liters, cost, date }) => {
    const sql = `
      INSERT INTO fuel_logs (vehicle_id, trip_id, liters, cost, date)
      VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE))
      RETURNING *;
    `;
    const result = await query(sql, [vehicle_id, trip_id, liters, cost, date]);
    return result.rows[0];
  },

  findAll: async ({ vehicle_id, trip_id } = {}) => {
    let sql = `
      SELECT f.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM fuel_logs f
      LEFT JOIN vehicles v ON f.vehicle_id = v.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (vehicle_id) {
      sql += ` AND f.vehicle_id = $${paramIndex++}`;
      values.push(vehicle_id);
    }
    if (trip_id) {
      sql += ` AND f.trip_id = $${paramIndex++}`;
      values.push(trip_id);
    }
    
    sql += ` ORDER BY f.date DESC, f.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT f.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM fuel_logs f
      LEFT JOIN vehicles v ON f.vehicle_id = v.id
      WHERE f.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['vehicle_id', 'trip_id', 'liters', 'cost', 'date'];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const sql = `
      UPDATE fuel_logs
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *;
    `;
    
    const result = await query(sql, values);
    return result.rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM fuel_logs WHERE id = $1 RETURNING *;`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }
};

module.exports = Fuel;
