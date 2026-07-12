const { query } = require('../config/db');

const Trip = {
  create: async ({
    source,
    destination,
    vehicle_id,
    driver_id,
    cargo_weight,
    planned_distance,
    revenue = 0.00,
    status = 'Draft'
  }) => {
    const sql = `
      INSERT INTO trips (
        source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, revenue, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [source, destination, vehicle_id, driver_id, cargo_weight, planned_distance, revenue, status];
    const result = await query(sql, values);
    return result.rows[0];
  },

  findAll: async ({ status, vehicle_id, driver_id } = {}) => {
    let sql = `
      SELECT t.*, 
             v.name as vehicle_name, v.registration_number as vehicle_registration, 
             d.name as driver_name, d.license_number as driver_license
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;

    if (status) {
      sql += ` AND t.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (vehicle_id) {
      sql += ` AND t.vehicle_id = $${paramIndex}`;
      values.push(vehicle_id);
      paramIndex++;
    }

    if (driver_id) {
      sql += ` AND t.driver_id = $${paramIndex}`;
      values.push(driver_id);
      paramIndex++;
    }

    sql += ` ORDER BY t.created_at DESC`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const sql = `
      SELECT t.*, 
             v.name as vehicle_name, v.registration_number as vehicle_registration, v.max_load_capacity, v.odometer as vehicle_odometer, v.status as vehicle_status,
             d.name as driver_name, d.license_number as driver_license, d.license_expiry_date as driver_license_expiry, d.status as driver_status
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.id = $1;
    `;
    const result = await query(sql, [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    // Allowed fields to update
    const allowedFields = [
      'source',
      'destination',
      'vehicle_id',
      'driver_id',
      'cargo_weight',
      'planned_distance',
      'actual_distance',
      'revenue',
      'status'
    ];

    for (const key of allowedFields) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(fields[key]);
        paramIndex++;
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const sql = `
      UPDATE trips
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *;
    `;
    
    const result = await query(sql, values);
    return result.rows[0];
  },

  delete: async (id) => {
    const sql = `DELETE FROM trips WHERE id = $1 RETURNING *;`;
    const result = await query(sql, [id]);
    return result.rows[0];
  }
};

module.exports = Trip;
