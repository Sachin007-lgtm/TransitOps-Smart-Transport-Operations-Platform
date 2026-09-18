const { query } = require('../config/db');

const Company = {
  create: async ({ name, contact_person, email, phone, address, gstin, opening_balance = 0.00, status = 'Active' }) => {
    const sql = `
      INSERT INTO companies (name, contact_person, email, phone, address, gstin, opening_balance, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;
    const values = [name, contact_person, email, phone, address, gstin, opening_balance, status];
    const result = await query(sql, values);
    return result.rows[0];
  },

  // Aggregates each company's unbilled trips and total outstanding balance
  // (opening balance + unpaid/partially-paid bills), the numbers the owner
  // scans before deciding who to bill next.
  findAll: async () => {
    const sql = `
      SELECT c.*,
        COALESCE(s.unbilled_trip_count, 0) AS unbilled_trip_count,
        COALESCE(s.unbilled_amount, 0) AS unbilled_amount,
        COALESCE(s.unbilled_advance, 0) AS unbilled_advance,
        c.opening_balance + COALESCE(p.prior_outstanding, 0) AS outstanding_balance
      FROM companies c
      LEFT JOIN (
        SELECT company_id,
               COUNT(*) AS unbilled_trip_count,
               COALESCE(SUM(revenue), 0) AS unbilled_amount,
               COALESCE(SUM(advance_received), 0) AS unbilled_advance
        FROM trips
        WHERE billing_status = 'Unbilled' AND status = 'Completed'
        GROUP BY company_id
      ) s ON s.company_id = c.id
      LEFT JOIN (
        SELECT company_id, COALESCE(SUM(balance_due - amount_paid), 0) AS prior_outstanding
        FROM bills
        WHERE status IN ('Unpaid', 'Partially Paid')
        GROUP BY company_id
      ) p ON p.company_id = c.id
      ORDER BY c.name;
    `;
    const result = await query(sql);
    return result.rows;
  },

  findById: async (id) => {
    const result = await query('SELECT * FROM companies WHERE id = $1', [id]);
    return result.rows[0];
  },

  update: async (id, fields) => {
    const allowedFields = ['name', 'contact_person', 'email', 'phone', 'address', 'gstin', 'opening_balance', 'status'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;
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
      UPDATE companies
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING *;
    `;
    const result = await query(sql, values);
    return result.rows[0];
  },

  delete: async (id) => {
    const result = await query('DELETE FROM companies WHERE id = $1 RETURNING *;', [id]);
    return result.rows[0];
  }
};

module.exports = Company;
