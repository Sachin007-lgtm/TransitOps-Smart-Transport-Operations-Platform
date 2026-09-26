const { query } = require('../config/db');

// Fields a client may change on an unbilled charge. Mirrors the validator.
const UPDATABLE_FIELDS = ['kind', 'description', 'amount', 'charge_date', 'trip_id'];

// Calendar dates travel as plain 'YYYY-MM-DD' text so they cannot shift a day
// for a reader outside IST (same convention as the bills module).
const SELECT_COLUMNS = `
  c.*, to_char(c.charge_date, 'YYYY-MM-DD') AS charge_date,
  co.name AS company_name
`;

const Charge = {
  /**
   * Add a charge (toll, loading, detention, ...) to a customer's open
   * statement. It stays unbilled until a statement is issued, so it needs no
   * booking beyond the company it belongs to.
   */
  create: async ({
    organization_id,
    company_id,
    trip_id = null,
    kind = 'MISC',
    description,
    amount,
    charge_date = null
  }) => {
    const sql = `
      INSERT INTO charges (
        organization_id, company_id, trip_id, kind, description, amount, charge_date
      ) VALUES ($1, $2, $3, $4, BTRIM($5), $6, COALESCE($7::date, CURRENT_DATE))
      RETURNING id, organization_id, company_id, trip_id, kind, description, amount,
                to_char(charge_date, 'YYYY-MM-DD') AS charge_date,
                billing_status, bill_id, created_at;
    `;
    const result = await query(sql, [
      organization_id,
      company_id,
      trip_id,
      kind,
      description,
      amount,
      charge_date
    ]);
    return result.rows[0];
  },

  /**
   * List charges, optionally for one company and/or one billing status.
   */
  findAll: async ({ organization_id, company_id, billing_status } = {}) => {
    let sql = `
      SELECT ${SELECT_COLUMNS}
      FROM charges c
      JOIN companies co ON co.id = c.company_id
      WHERE c.organization_id = $1
    `;
    const values = [organization_id];
    let paramIndex = 2;

    if (company_id) {
      sql += ` AND c.company_id = $${paramIndex++}`;
      values.push(company_id);
    }
    if (billing_status) {
      sql += ` AND c.billing_status = $${paramIndex++}`;
      values.push(billing_status);
    }

    sql += ' ORDER BY c.charge_date ASC NULLS LAST, c.id ASC;';

    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id, organization_id) => {
    const result = await query(
      `SELECT ${SELECT_COLUMNS}
       FROM charges c
       JOIN companies co ON co.id = c.company_id
       WHERE c.id = $1 AND c.organization_id = $2`,
      [id, organization_id]
    );
    return result.rows[0] || null;
  },

  /**
   * Update a charge. Refuses once the charge is on an issued statement — the
   * statement is a snapshot and must keep matching what the customer received.
   */
  update: async (id, fields, organization_id) => {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const key of UPDATABLE_FIELDS) {
      if (fields[key] !== undefined) {
        setClause.push(`${key} = $${paramIndex++}`);
        values.push(fields[key]);
      }
    }

    if (setClause.length === 0) return null;

    values.push(id);
    const idParam = paramIndex++;
    values.push(organization_id);
    const orgParam = paramIndex++;

    const sql = `
      UPDATE charges
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND organization_id = $${orgParam} AND billing_status = 'Unbilled'
      RETURNING id, organization_id, company_id, trip_id, kind, description, amount,
                to_char(charge_date, 'YYYY-MM-DD') AS charge_date,
                billing_status, bill_id;
    `;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  /**
   * Remove a charge that has not been issued yet. Returns null when it is
   * missing, belongs to another organization, or is already on a statement.
   */
  delete: async (id, organization_id) => {
    const result = await query(
      `DELETE FROM charges
       WHERE id = $1 AND organization_id = $2 AND billing_status = 'Unbilled'
       RETURNING id, company_id, description, amount;`,
      [id, organization_id]
    );
    return result.rows[0] || null;
  },

  /**
   * The charges waiting to be issued on this customer's statement — the
   * counterpart of Bill.findUnbilledTrips, and what the preview is built from.
   */
  findUnbilled: async (organization_id, company_id) => {
    const result = await query(
      `SELECT ${SELECT_COLUMNS}
       FROM charges c
       JOIN companies co ON co.id = c.company_id
       WHERE c.organization_id = $1 AND c.company_id = $2 AND c.billing_status = 'Unbilled'
       ORDER BY c.charge_date ASC NULLS LAST, c.id ASC;`,
      [organization_id, company_id]
    );
    return result.rows;
  }
};

module.exports = Charge;
