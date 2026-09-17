const { query, pool } = require('../config/db');

const Bill = {
  // List bills (optionally for one company), newest first, with company name.
  findAll: async ({ company_id, status } = {}) => {
    let sql = `
      SELECT b.*, c.name AS company_name
      FROM bills b
      JOIN companies c ON b.company_id = c.id
      WHERE 1=1
    `;
    const values = [];
    let paramIndex = 1;
    if (company_id) {
      sql += ` AND b.company_id = $${paramIndex}`;
      values.push(company_id);
      paramIndex++;
    }
    if (status) {
      sql += ` AND b.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }
    sql += ` ORDER BY b.created_at DESC;`;
    const result = await query(sql, values);
    return result.rows;
  },

  findById: async (id) => {
    const billResult = await query(
      `SELECT b.*, c.name AS company_name, c.address AS company_address, c.gstin AS company_gstin,
              c.phone AS company_phone, c.contact_person AS company_contact_person
       FROM bills b
       JOIN companies c ON b.company_id = c.id
       WHERE b.id = $1;`,
      [id]
    );
    const bill = billResult.rows[0];
    if (!bill) return null;

    const items = await query(
      `SELECT * FROM bill_items WHERE bill_id = $1 ORDER BY trip_date ASC NULLS LAST, id ASC;`,
      [id]
    );
    const payments = await query(
      `SELECT * FROM payments WHERE bill_id = $1 ORDER BY payment_date ASC, id ASC;`,
      [id]
    );
    return { ...bill, items: items.rows, payments: payments.rows };
  },

  // Unbilled (completed) trips for a company — the pool "Generate Bill" composes.
  findUnbilledTrips: async (company_id) => {
    const sql = `
      SELECT t.*, v.registration_number AS vehicle_registration, v.name AS vehicle_name,
             d.name AS driver_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.company_id = $1
        AND t.billing_status = 'Unbilled'
        AND t.status = 'Completed'
      ORDER BY t.trip_date ASC NULLS LAST, t.created_at ASC;
    `;
    const result = await query(sql, [company_id]);
    return result.rows;
  },

  // Previous balance for a company = opening balance + unsettled prior bills.
  // Mirrors the "PREVIOUS BALANCE" line on the paper ledger bills.
  getPreviousBalance: async (client, company_id) => {
    const sql = `
      SELECT COALESCE(SUM(balance_due - amount_paid), 0) AS prior_outstanding
      FROM bills
      WHERE company_id = $1 AND status IN ('Unpaid', 'Partially Paid');
    `;
    const result = await (client || pool).query(sql, [company_id]);
    const companyResult = await (client || pool).query(
      'SELECT opening_balance FROM companies WHERE id = $1',
      [company_id]
    );
    const opening = parseFloat(companyResult.rows[0]?.opening_balance || 0);
    const prior = parseFloat(result.rows[0]?.prior_outstanding || 0);
    return opening + prior;
  },

  // Generate a bill: inside one transaction, snapshot the company's unbilled
  // completed trips into bill_items, mark them Billed, and compute the
  // ledger-style totals. Idempotency is by construction — once billed, trips
  // leave the unbilled pool.
  generate: async ({ company_id, note }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const companyResult = await client.query(
        'SELECT id, opening_balance FROM companies WHERE id = $1 FOR UPDATE;',
        [company_id]
      );
      if (companyResult.rows.length === 0) {
        const err = new Error('Company not found.');
        err.statusCode = 404;
        throw err;
      }

      const tripsResult = await client.query(
        `SELECT t.*, v.registration_number AS vehicle_registration
         FROM trips t
         LEFT JOIN vehicles v ON t.vehicle_id = v.id
         WHERE t.company_id = $1 AND t.billing_status = 'Unbilled' AND t.status = 'Completed'
         ORDER BY t.trip_date ASC NULLS LAST, t.created_at ASC
         FOR UPDATE OF t;`,
        [company_id]
      );
      const unbilledTrips = tripsResult.rows;
      if (unbilledTrips.length === 0) {
        const err = new Error('No unbilled completed trips for this company.');
        err.statusCode = 400;
        throw err;
      }

      const previousBalance = await Bill.getPreviousBalance(client, company_id);

      const subtotal = unbilledTrips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0);
      const totalAdvance = unbilledTrips.reduce(
        (sum, t) => sum + parseFloat(t.advance_received || 0), 0
      );
      const balanceDue = previousBalance + subtotal - totalAdvance;

      const billNoResult = await client.query(
        "SELECT 'INV-' || LPAD(nextval('bill_number_seq')::TEXT, 4, '0') AS bill_no;"
      );
      const bill_no = billNoResult.rows[0].bill_no;

      const billResult = await client.query(
        `INSERT INTO bills (bill_no, company_id, previous_balance, subtotal, total_advance, balance_due, status, note)
         VALUES ($1, $2, $3, $4, $5, $6, 'Unpaid', $7)
         RETURNING *;`,
        [bill_no, company_id, previousBalance, subtotal, totalAdvance, balanceDue, note || null]
      );
      const bill = billResult.rows[0];

      for (const trip of unbilledTrips) {
        const particulars = `${trip.source} to ${trip.destination}`;
        await client.query(
          `INSERT INTO bill_items (bill_id, trip_id, trip_date, source, destination, particulars,
                                   vehicle_registration, rate_basis, amount, advance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
          [
            bill.id,
            trip.id,
            trip.trip_date,
            trip.source,
            trip.destination,
            particulars,
            trip.vehicle_registration,
            trip.rate_basis || null,
            parseFloat(trip.revenue || 0),
            parseFloat(trip.advance_received || 0)
          ]
        );
        await client.query(
          `UPDATE trips SET billing_status = 'Billed', bill_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2;`,
          [bill.id, trip.id]
        );
      }

      await client.query('COMMIT');
      return Bill.findById(bill.id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Record a payment against a bill and update denormalized totals + status.
  recordPayment: async ({ bill_id, amount, mode, payment_date, note }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const billResult = await client.query(
        'SELECT * FROM bills WHERE id = $1 FOR UPDATE;',
        [bill_id]
      );
      const bill = billResult.rows[0];
      if (!bill) {
        const err = new Error('Bill not found.');
        err.statusCode = 404;
        throw err;
      }

      await client.query(
        `INSERT INTO payments (bill_id, amount, mode, payment_date, note)
         VALUES ($1, $2, $3, $4, $5);`,
        [bill_id, amount, mode, payment_date, note || null]
      );

      const paidResult = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE bill_id = $1;',
        [bill_id]
      );
      // paidResult already includes the payment inserted above — no extra add.
      const totalPaid = parseFloat(paidResult.rows[0].total_paid);
      const balanceDue = parseFloat(bill.balance_due);

      if (totalPaid > balanceDue + 0.001) {
        // Ledger discipline: payments beyond the balance due are rejected
        // (they'd corrupt amount_paid); a fresh statement should be issued
        // instead.
        const err = new Error(
          `Payment exceeds remaining balance (₹${(balanceDue - parseFloat(bill.amount_paid || 0)).toFixed(2)}).`
        );
        err.statusCode = 400;
        throw err;
      }

      let status;
      if (totalPaid >= balanceDue) {
        status = 'Paid';
      } else if (totalPaid > 0) {
        status = 'Partially Paid';
      } else {
        status = 'Unpaid';
      }

      const updatedBill = await client.query(
        `UPDATE bills
         SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *;`,
        [totalPaid, status, bill_id]
      );

      await client.query('COMMIT');
      return Bill.findById(bill_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  delete: async (id) => {
    // Deleting a bill returns its trips to the unbilled pool (cascade removes
    // bill_items; payments are removed by cascade too — caller should confirm).
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE trips SET billing_status = 'Unbilled', bill_id = NULL WHERE bill_id = $1;`,
        [id]
      );
      const result = await client.query('DELETE FROM bills WHERE id = $1 RETURNING *;', [id]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = Bill;
