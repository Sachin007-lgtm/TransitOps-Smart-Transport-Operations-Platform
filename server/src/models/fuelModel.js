const { query } = require('../config/db');

const FuelLog = {
  create: async ({
    vehicle_id,
    trip_id = null,
    liters,
    cost,
    date = new Date()
  }) => {
    const sql = `
      INSERT INTO fuel_logs (
        vehicle_id, trip_id, liters, cost, date
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *;
    `;
    const values = [vehicle_id, trip_id, liters, cost, date];
    const result = await query(sql, values);
    return result.rows[0];
  },

  findAll: async ({ vehicle_id, trip_id } = {}) => {
    let sql = `
      SELECT fl.*, v.name as vehicle_name, v.registration_number as vehicle_registration
      FROM fuel_logs fl
      LEFT JOIN vehicles v ON fl.vehicle_id = v.id
      WHERE 1=1
    `;
    const values = [];
    let idx = 1;

    if (vehicle_id) {
      sql += ` AND fl.vehicle_id = $${idx++}`;
      values.push(vehicle_id);
    }
    if (trip_id) {
      sql += ` AND fl.trip_id = $${idx++}`;
      values.push(trip_id);
    }

    sql += ` ORDER BY fl.date DESC, fl.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT fl.*, v.name as vehicle_name, v.registration_number as vehicle_registration
      FROM fuel_logs fl
      LEFT JOIN vehicles v ON fl.vehicle_id = v.id
      WHERE fl.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const allowedFields = ['vehicle_id', 'trip_id', 'liters', 'cost', 'date'];
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
      UPDATE fuel_logs
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
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

module.exports = FuelLog;
