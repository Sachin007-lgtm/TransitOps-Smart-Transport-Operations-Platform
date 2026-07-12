const { query } = require('../config/db');

const Maintenance = {
  create: async ({
    vehicle_id,
    description,
    cost = 0.00,
    start_date = new Date(),
    end_date = null,
    status = 'Active'
  }) => {
    const sql = `
      INSERT INTO maintenance_logs (
        vehicle_id, description, cost, start_date, end_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [vehicle_id, description, cost, start_date, end_date, status];
    const result = await query(sql, values);
    return result.rows[0];
  },

  findAll: async ({ status, vehicle_id } = {}) => {
    let sql = `
      SELECT ml.*, v.name as vehicle_name, v.registration_number as vehicle_registration
      FROM maintenance_logs ml
      LEFT JOIN vehicles v ON ml.vehicle_id = v.id
      WHERE 1=1
    `;
    const values = [];
    let idx = 1;

    if (status) {
      sql += ` AND ml.status = $${idx++}`;
      values.push(status);
    }
    if (vehicle_id) {
      sql += ` AND ml.vehicle_id = $${idx++}`;
      values.push(vehicle_id);
    }

    sql += ` ORDER BY ml.start_date DESC, ml.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT ml.*, v.name as vehicle_name, v.registration_number as vehicle_registration, v.status as vehicle_status
      FROM maintenance_logs ml
      LEFT JOIN vehicles v ON ml.vehicle_id = v.id
      WHERE ml.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const allowedFields = ['description', 'cost', 'start_date', 'end_date', 'status'];
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
      UPDATE maintenance_logs
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
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
