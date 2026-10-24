const { query } = require('../config/db');

// Fields a client may change on an expense. Mirrors the validator; category is
// settable on correction (the office fixes the category after entry), but a
// recovered expense is locked down in the service layer instead.
// Fields a client may change on an expense. Mirrors the validator; category is
// settable on correction (the office fixes the category after entry), but a
// recovered expense is locked down in the service layer instead.
const UPDATABLE_FIELDS = [
  'category', 'description', 'amount', 'expense_date', 'trip_id', 'driver_id',
  'odometer', 'quantity', 'vendor', 'payment_mode', 'invoice_number', 'receipt_url',
  'approval_status', 'flag_reasons', 'reviewed_by', 'reviewed_at', 'review_notes'
];

// Calendar dates travel as plain 'YYYY-MM-DD' text so they cannot shift a day
// for a reader outside IST (same convention as the bills module).
const SELECT_COLUMNS = `
  e.id, e.organization_id, e.vehicle_id, e.trip_id, e.driver_id, e.category,
  e.description, e.amount, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date,
  e.odometer, e.quantity, e.vendor, e.payment_mode, e.recovered_charge_id,
  e.invoice_number, e.receipt_url, e.approval_status, e.flag_reasons,
  e.reviewed_by, e.reviewed_at, e.review_notes,
  e.created_at, e.updated_at,
  v.registration_number AS vehicle_registration, v.type AS vehicle_kind,
  v.status AS vehicle_status, v.fuel_tank_capacity,
  d.name AS driver_name,
  c.name AS company_name
`;

const BASE_FROM = `
  FROM expenses e
  JOIN vehicles v ON v.id = e.vehicle_id AND v.organization_id = e.organization_id
  LEFT JOIN drivers d ON d.id = e.driver_id AND d.organization_id = e.organization_id
  LEFT JOIN trips t ON t.id = e.trip_id AND t.organization_id = e.organization_id
  LEFT JOIN companies c ON c.id = t.company_id
`;

const expenseModel = {
  /**
   * Create an expense. All tenant scoping flows through organization_id.
   */
  create: async ({
    organization_id, vehicle_id, trip_id = null, driver_id = null, category,
    description, amount, expense_date = null, odometer = null, quantity = null,
    vendor = null, payment_mode = 'Cash', invoice_number = null, receipt_url = null,
    approval_status = 'Approved', flag_reasons = [], created_by = null
  }) => {
    const sql = `
      INSERT INTO expenses (
        organization_id, vehicle_id, trip_id, driver_id, category, description,
        amount, expense_date, odometer, quantity, vendor, payment_mode,
        invoice_number, receipt_url, approval_status, flag_reasons, created_by
      ) VALUES ($1, $2, $3, $4, $5, BTRIM($6), $7, COALESCE($8, CURRENT_DATE),
                $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *;
    `;
    const values = [
      organization_id, vehicle_id, trip_id, driver_id, category, description,
      amount, expense_date, odometer, quantity, vendor, payment_mode,
      invoice_number ? invoice_number.trim() : null, receipt_url,
      approval_status, flag_reasons, created_by
    ];
    const result = await query(sql, values);
    return result.rows[0];
  },

  /**
   * One expense, scoped to the tenant.
   */
  findById: async (id, organization_id) => {
    const sql = `SELECT ${SELECT_COLUMNS} ${BASE_FROM} WHERE e.id = $1 AND e.organization_id = $2;`;
    const result = await query(sql, [id, organization_id]);
    return result.rows[0] || null;
  },

  /**
   * The ledger for the tenant, with filters. Every filter is optional and
   * composable; pagination is applied by the service via LIMIT/OFFSET params.
   */
  findAll: async (organization_id, {
    vehicle_id = null, category = null, from_date = null, to_date = null,
    recovered = null, approval_status = null, limit = null, offset = 0
  } = {}) => {
    const values = [organization_id];
    const conditions = ['e.organization_id = $1'];

    if (vehicle_id) {
      values.push(vehicle_id);
      conditions.push(`e.vehicle_id = $${values.length}`);
    }
    if (category) {
      values.push(category);
      conditions.push(`e.category = $${values.length}`);
    }
    if (approval_status) {
      values.push(approval_status);
      conditions.push(`e.approval_status = $${values.length}`);
    }
    if (from_date) {
      values.push(from_date);
      conditions.push(`e.expense_date >= $${values.length}`);
    }
    if (to_date) {
      values.push(to_date);
      conditions.push(`e.expense_date <= $${values.length}`);
    }
    if (recovered === true) {
      conditions.push('e.recovered_charge_id IS NOT NULL');
    } else if (recovered === false) {
      conditions.push('e.recovered_charge_id IS NULL');
    }

    let sql = `SELECT ${SELECT_COLUMNS} ${BASE_FROM} WHERE ${conditions.join(' AND ')}
      ORDER BY e.expense_date DESC, e.created_at DESC`;

    if (limit) {
      values.push(limit);
      sql += ` LIMIT $${values.length}`;
      values.push(offset);
      sql += ` OFFSET $${values.length}`;
    }

    const result = await query(sql, values);
    return result.rows;
  },

  /**
   * Count with the same filters, for pagination totals.
   */
  count: async (organization_id, filters = {}) => {
    const { vehicle_id = null, category = null, from_date = null, to_date = null, recovered = null, approval_status = null } = filters;
    const values = [organization_id];
    const conditions = ['e.organization_id = $1'];

    if (vehicle_id) { values.push(vehicle_id); conditions.push(`e.vehicle_id = $${values.length}`); }
    if (category) { values.push(category); conditions.push(`e.category = $${values.length}`); }
    if (approval_status) { values.push(approval_status); conditions.push(`e.approval_status = $${values.length}`); }
    if (from_date) { values.push(from_date); conditions.push(`e.expense_date >= $${values.length}`); }
    if (to_date) { values.push(to_date); conditions.push(`e.expense_date <= $${values.length}`); }
    if (recovered === true) conditions.push('e.recovered_charge_id IS NOT NULL');
    else if (recovered === false) conditions.push('e.recovered_charge_id IS NULL');

    const result = await query(
      `SELECT COUNT(*)::int AS total FROM expenses e WHERE ${conditions.join(' AND ')};`,
      values
    );
    return result.rows[0].total;
  },

  /**
   * Find most recent fuel entry for a vehicle before or on a given date,
   * optionally excluding a specific expense id.
   */
  findLatestFuelEntry: async (organization_id, vehicle_id, before_date = null, exclude_id = null) => {
    const values = [organization_id, vehicle_id];
    let sql = `
      SELECT e.id, e.odometer, e.quantity, e.expense_date, e.vendor, e.amount, e.invoice_number
      FROM expenses e
      WHERE e.organization_id = $1 AND e.vehicle_id = $2 AND e.category = 'FUEL'
    `;
    if (before_date) {
      values.push(before_date);
      sql += ` AND e.expense_date <= $${values.length}`;
    }
    if (exclude_id) {
      values.push(exclude_id);
      sql += ` AND e.id <> $${values.length}`;
    }
    sql += ` ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 1`;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  /**
   * Check for duplicate invoice/bill number within the organization.
   */
  findDuplicateInvoice: async (organization_id, invoice_number, exclude_id = null) => {
    if (!invoice_number || !invoice_number.trim()) return null;
    const values = [organization_id, invoice_number.trim().toLowerCase()];
    let sql = `
      SELECT e.id, e.invoice_number, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date,
             e.amount, e.vendor, v.registration_number AS vehicle_registration
      FROM expenses e
      JOIN vehicles v ON v.id = e.vehicle_id
      WHERE e.organization_id = $1 AND LOWER(BTRIM(e.invoice_number)) = $2
    `;
    if (exclude_id) {
      values.push(exclude_id);
      sql += ` AND e.id <> $${values.length}`;
    }
    sql += ` LIMIT 1`;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  /**
   * Check for identical claim (same amount, vendor, vehicle, within 1 day).
   */
  findDuplicateClaim: async (organization_id, vehicle_id, vendor, amount, expense_date, exclude_id = null) => {
    if (!amount) return null;
    const values = [organization_id, vehicle_id, amount];
    let sql = `
      SELECT e.id, e.amount, e.vendor, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date,
             v.registration_number AS vehicle_registration
      FROM expenses e
      JOIN vehicles v ON v.id = e.vehicle_id
      WHERE e.organization_id = $1 AND e.vehicle_id = $2 AND e.amount = $3 AND e.category = 'FUEL'
    `;
    if (vendor && vendor.trim()) {
      values.push(vendor.trim().toLowerCase());
      sql += ` AND LOWER(BTRIM(COALESCE(e.vendor, ''))) = $${values.length}`;
    }
    if (expense_date) {
      values.push(expense_date);
      sql += ` AND ABS(e.expense_date - $${values.length}::date) <= 1`;
    }
    if (exclude_id) {
      values.push(exclude_id);
      sql += ` AND e.id <> $${values.length}`;
    }
    sql += ` LIMIT 1`;
    const result = await query(sql, values);
    return result.rows[0] || null;
  },

  /**
   * Review an expense (Approve or Reject with notes).
   */
  review: async (id, organization_id, { approval_status, reviewed_by, review_notes = null }) => {
    const sql = `
      UPDATE expenses
      SET approval_status = $1,
          reviewed_by = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          review_notes = $3,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND organization_id = $5
      RETURNING *;
    `;
    const result = await query(sql, [approval_status, reviewed_by, review_notes, id, organization_id]);
    return result.rows[0] || null;
  },

  /**
   * Update an expense (the service decides whether the fields are locked).
   */
  update: async (id, organization_id, payload) => {
    const fields = Object.keys(payload).filter((key) => UPDATABLE_FIELDS.includes(key));
    if (fields.length === 0) return null;

    const setClause = fields.map((field, index) => {
      const param = `$${index + 3}`;
      if (field === 'description') return `description = BTRIM(${param})`;
      return `${field} = ${param}`;
    });
    const values = fields.map((field) => payload[field]);

    const sql = `
      UPDATE expenses SET ${setClause.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND organization_id = $2
      RETURNING *;
    `;
    const result = await query(sql, [id, organization_id, ...values]);
    return result.rows[0] || null;
  },

  /**
   * Delete an expense that was never recovered. Recovered ones are blocked in
   * the service layer (the customer statement depends on the linked charge).
   */
  remove: async (id, organization_id) => {
    const result = await query(
      'DELETE FROM expenses WHERE id = $1 AND organization_id = $2 RETURNING id;',
      [id, organization_id]
    );
    return result.rows[0] || null;
  },

  /**
   * Per-vehicle cost summary: spend by category group, odometer span, and
   * litres for fuel entries. This is the payoff report.
   */
  vehicleSummary: async (organization_id, vehicle_id = null, from_date = null, to_date = null) => {
    const values = [organization_id];
    const conditions = ['e.organization_id = $1'];
    if (vehicle_id) { values.push(vehicle_id); conditions.push(`e.vehicle_id = $${values.length}`); }
    if (from_date) { values.push(from_date); conditions.push(`e.expense_date >= $${values.length}`); }
    if (to_date) { values.push(to_date); conditions.push(`e.expense_date <= $${values.length}`); }
    const where = conditions.join(' AND ');

    const sql = `
      SELECT
        v.id AS vehicle_id, v.registration_number, v.type AS vehicle_kind,
        COALESCE(SUM(e.amount), 0)::float AS total_cost,
        SUM(CASE WHEN e.category = 'FUEL' THEN e.amount ELSE 0 END)::float AS fuel_cost,
        SUM(CASE WHEN e.category = 'MAINTENANCE' THEN e.amount ELSE 0 END)::float AS maintenance_cost,
        SUM(CASE WHEN e.category NOT IN ('FUEL', 'MAINTENANCE') THEN e.amount ELSE 0 END)::float AS other_cost,
        MAX(e.odometer) FILTER (WHERE e.category = 'FUEL') AS last_odometer,
        SUM(e.quantity) FILTER (WHERE e.category = 'FUEL')::float AS total_litres,
        COUNT(e.id)::int AS entry_count
      FROM expenses e
      JOIN vehicles v ON v.id = e.vehicle_id AND v.organization_id = e.organization_id
      WHERE ${where}
      GROUP BY v.id, v.registration_number, v.type
      ORDER BY total_cost DESC;
    `;
    const result = await query(sql, values);
    return result.rows;
  },
  /**
   * Monthly breakdown by category: entries, litres, odometer span and spend
   * per category for one calendar month. This is the summary table of the
   * Fuel & Expense page's monthly bill.
   */
  monthlyBreakdown: async (organization_id, from_date, to_date) => {
    const result = await query(
      `SELECT
        e.category,
        COUNT(e.id)::int AS entry_count,
        COALESCE(SUM(e.amount), 0)::float AS total_amount,
        COALESCE(SUM(e.quantity) FILTER (WHERE e.category = 'FUEL'), 0)::float AS litres,
        MIN(e.odometer) FILTER (WHERE e.category = 'FUEL') AS first_odometer,
        MAX(e.odometer) FILTER (WHERE e.category = 'FUEL') AS last_odometer
      FROM expenses e
      WHERE e.organization_id = $1 AND e.expense_date >= $2 AND e.expense_date <= $3
      GROUP BY e.category
      ORDER BY total_amount DESC;`,
      [organization_id, from_date, to_date]
    );
    return result.rows;
  }
};

module.exports = expenseModel;
