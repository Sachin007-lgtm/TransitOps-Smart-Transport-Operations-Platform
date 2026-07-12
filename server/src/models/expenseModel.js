const { query } = require('../config/db');

const Expense = {
  create: async ({ vehicle_id = null, trip_id = null, description, amount, date }) => {
    const sql = `
      INSERT INTO expenses (vehicle_id, trip_id, description, amount, date)
      VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE))
      RETURNING *;
    `;
    const result = await query(sql, [vehicle_id, trip_id, description, amount, date]);
    return result.rows[0];
  },

  findAll: async ({ vehicle_id, trip_id } = {}) => {
    let sql = `
      SELECT e.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM expenses e
      LEFT JOIN vehicles v ON e.vehicle_id = v.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (vehicle_id) {
      sql += ` AND e.vehicle_id = $${paramIndex++}`;
      values.push(vehicle_id);
    }
    if (trip_id) {
      sql += ` AND e.trip_id = $${paramIndex++}`;
      values.push(trip_id);
    }
    
    sql += ` ORDER BY e.date DESC, e.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT e.*, v.registration_number as vehicle_registration, v.name as vehicle_name
      FROM expenses e
      LEFT JOIN vehicles v ON e.vehicle_id = v.id
      WHERE e.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    const allowedFields = ['vehicle_id', 'trip_id', 'description', 'amount', 'date'];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const sql = `
      UPDATE expenses
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *;
    `;
    
    const result = await query(sql, values);
    return result.rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM expenses WHERE id = $1 RETURNING *;`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }
};

module.exports = Expense;
