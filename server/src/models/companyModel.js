const { query } = require('../config/db');

// Fields a client is allowed to change on a company. Mirrors the validator.
const UPDATABLE_FIELDS = [
  'name',
  'contact_person',
  'email',
  'phone',
  'address',
  'gstin',
  'opening_balance',
  'status'
];

const Company = {
  /**
   * Register a company (a customer the fleet hauls for) inside one organization.
   */
  create: async ({
    organization_id,
    name,
    contact_person = null,
    email = null,
    phone = null,
    address = null,
    gstin = null,
    opening_balance = 0.00,
    status = 'Active'
  }) => {
    const sql = `
      INSERT INTO companies (
        organization_id, name, contact_person, email, phone, address, gstin,
        opening_balance, status
      ) VALUES ($1, BTRIM($2), $3, $4, $5, $6, $7, $8, $9)
      RETURNING *;
    `;
    const values = [
      organization_id,
      name,
      contact_person,
      email,
      phone,
      address,
      gstin,
      opening_balance,
      status
    ];
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * Resolve the customer name typed on a trip to a company row, creating the
   * company on first use.
   *
   * Trips capture their customer as free text, so this is the bridge that
   * makes "all trips of the same company" an actual grouping instead of a
   * string match: every trip of one customer ends up carrying the same
   * company_id, which is what a bill is composed from.
   *
   * Written as a single statement so two trips saved at the same moment
   * cannot create two companies for the same customer — the unique index on
   * (organization_id, LOWER(BTRIM(name))) is the arbiter, and the no-op
   * DO UPDATE returns the row that already exists.
   *
   * @param {string} organization_id tenant
   * @param {string} name            customer name as typed
   * @param {object} [client]        transaction client, when inside one
   */
  findOrCreateByName: async (organization_id, name, client = null) => {
    const sql = `
      INSERT INTO companies (organization_id, name)
      VALUES ($1, BTRIM($2))
      ON CONFLICT (organization_id, LOWER(BTRIM(name)))
      DO UPDATE SET name = companies.name
      RETURNING *;
    `;
    const executor = client || { query };
    const result = await executor.query(sql, [organization_id, name]);
    return result.rows[0];
  },

  /**
   * List companies with the numbers the owner scans before billing someone:
   * how many trips are waiting to be billed, their value, and what the
   * company already owes from earlier bills.
   */
  findAll: async (organization_id) => {
    const sql = `
      SELECT c.*,
        COALESCE(s.unbilled_trip_count, 0) AS unbilled_trip_count,
        COALESCE(s.unbilled_amount, 0)     AS unbilled_amount,
        COALESCE(s.unbilled_advance, 0)    AS unbilled_advance,
        c.opening_balance + COALESCE(p.prior_outstanding, 0) AS outstanding_balance,
        COALESCE(p.open_bill_count, 0)     AS open_bill_count
      FROM companies c
      LEFT JOIN (
        SELECT company_id,
               COUNT(*)                        AS unbilled_trip_count,
               COALESCE(SUM(revenue), 0)       AS unbilled_amount,
               COALESCE(SUM(advance_received), 0) AS unbilled_advance
        FROM trips
        WHERE organization_id = $1
          AND billing_status = 'Unbilled'
          AND status = 'Completed'
          AND revenue > 0
        GROUP BY company_id
      ) s ON s.company_id = c.id
      LEFT JOIN (
        SELECT company_id,
               COALESCE(SUM(balance_due - amount_paid), 0) AS prior_outstanding,
               COUNT(*)                                    AS open_bill_count
        FROM bills
        WHERE organization_id = $1 AND status IN ('Unpaid', 'Partially Paid')
        GROUP BY company_id
      ) p ON p.company_id = c.id
      WHERE c.organization_id = $1
      ORDER BY c.name ASC;
    `;
    const result = await query(sql, [organization_id]);
    return result.rows;
  },

  findById: async (id, organization_id) => {
    const result = await query(
      'SELECT * FROM companies WHERE id = $1 AND organization_id = $2',
      [id, organization_id]
    );
    return result.rows[0] || null;
  },

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
      UPDATE companies
      SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParam} AND organization_id = $${orgParam}
      RETURNING *;
    `;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  delete: async (id, organization_id) => {
    const result = await query(
      'DELETE FROM companies WHERE id = $1 AND organization_id = $2 RETURNING *;',
      [id, organization_id]
    );
    return result.rows[0] || null;
  }
};

module.exports = Company;
