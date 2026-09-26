const { query, pool } = require('../config/db');
const { numberToWords } = require('../utils/amountInWords');

// Money rounds to paise at every boundary so a sum of floats can never leak
// into a stored DECIMAL(12,2) as 44999.999999999993.
function round2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function remainingOf(bill) {
  // A voided bill is history: its number stays visible, but nobody owes it.
  if (bill.status === 'Void') return 0;
  return Math.max(0, round2(parseFloat(bill.balance_due) - parseFloat(bill.amount_paid || 0)));
}

const Bill = {
  /**
   * List bills (optionally for one company / one status), newest first.
   */
  findAll: async ({ organization_id, company_id, status } = {}) => {
    let sql = `
      SELECT b.*, to_char(b.bill_date, 'YYYY-MM-DD') AS bill_date, c.name AS company_name
      FROM bills b
      JOIN companies c ON b.company_id = c.id
      WHERE b.organization_id = $1
    `;
    const values = [organization_id];
    let paramIndex = 2;

    if (company_id) {
      sql += ` AND b.company_id = $${paramIndex++}`;
      values.push(company_id);
    }
    if (status) {
      sql += ` AND b.status = $${paramIndex++}`;
      values.push(status);
    }

    sql += ' ORDER BY b.created_at DESC, b.id DESC;';

    const result = await query(sql, values);
    return result.rows.map((row) => ({
      ...row,
      remaining_balance: remainingOf(row),
      balance_due_in_words: numberToWords(row.balance_due),
      remaining_balance_in_words: numberToWords(remainingOf(row))
    }));
  },

  /**
   * Full bill: header, the snapshotted line items, payments, and the
   * outstanding balance in figures and words.
   */
  findById: async (id, organization_id) => {
    const billResult = await query(
      `SELECT b.*, to_char(b.bill_date, 'YYYY-MM-DD') AS bill_date,
              c.name AS company_name, c.address AS company_address,
              c.gstin AS company_gstin, c.phone AS company_phone,
              c.contact_person AS company_contact_person,
              o.name AS organization_name
       FROM bills b
       JOIN companies c ON b.company_id = c.id
       JOIN organizations o ON b.organization_id = o.id
       WHERE b.id = $1 AND b.organization_id = $2;`,
      [id, organization_id]
    );
    const bill = billResult.rows[0];
    if (!bill) return null;

    // Plain 'YYYY-MM-DD' rather than a timestamp: these are calendar dates on
    // a bill, and a timestamp would shift by a day for any reader west of IST.
    const items = await query(
      `SELECT id, bill_id, trip_id, to_char(trip_date, 'YYYY-MM-DD') AS trip_date,
              origin, destination, particulars, vehicle_registration,
              amount, advance
       FROM bill_items WHERE bill_id = $1 ORDER BY trip_date ASC NULLS LAST, id ASC;`,
      [id]
    );
    const payments = await query(
      `SELECT id, bill_id, amount, mode, to_char(payment_date, 'YYYY-MM-DD') AS payment_date, note
       FROM payments WHERE bill_id = $1 ORDER BY payment_date ASC, id ASC;`,
      [id]
    );
    const charges = await query(
      `SELECT id, bill_id, charge_id, kind, description, amount,
              to_char(charge_date, 'YYYY-MM-DD') AS charge_date
       FROM bill_charges WHERE bill_id = $1 ORDER BY charge_date ASC NULLS LAST, id ASC;`,
      [id]
    );

    // Outstanding after payments — the figure the bottom BALANCE line shows on
    // the paper bills. Computed here so the detail API and the printed
    // document can never disagree.
    const remaining = remainingOf(bill);

    return {
      ...bill,
      items: items.rows,
      charges: charges.rows,
      payments: payments.rows,
      remaining_balance: remaining,
      balance_due_in_words: numberToWords(bill.balance_due),
      remaining_balance_in_words: numberToWords(remaining)
    };
  },

  /**
   * Every trip of a company that has not been billed yet and is not
   * cancelled — the raw pool the "Generate bill" preview is built from.
   * The caller decides which statuses count as billable; this query only
   * removes what can never belong on a bill (already billed, cancelled).
   */
  findUnbilledTrips: async (organization_id, company_id) => {
    const sql = `
      SELECT t.id, t.organization_id, t.company_id, t.external_party_name,
             t.origin, t.destination, t.planned_route,
             t.vehicle_id, t.driver_id, t.status, t.revenue,
             t.advance_received, t.billing_status, t.bill_id,
             -- Calendar date as text, so it cannot shift a day for a reader
             -- in another timezone.
             to_char(t.trip_date, 'YYYY-MM-DD') AS trip_date,
             v.registration_number AS vehicle_registration,
             v.name AS vehicle_name,
             d.name AS driver_name
      FROM trips t
      LEFT JOIN vehicles v ON t.vehicle_id = v.id
      LEFT JOIN drivers d ON t.driver_id = d.id
      WHERE t.organization_id = $1
        AND t.company_id = $2
        AND t.billing_status = 'Unbilled'
        AND t.status <> 'Cancelled'
      ORDER BY t.trip_date ASC NULLS LAST, t.id ASC;
    `;
    const result = await query(sql, [organization_id, company_id]);
    return result.rows;
  },

  /**
   * Previous balance for a company = opening balance + everything still
   * unpaid on earlier bills. Mirrors the "PREVIOUS BALANCE" line of the paper
   * ledger bills: a new bill carries the old dues forward, so the company's
   * total owed is never lost between statements.
   */
  getPreviousBalance: async (client, organization_id, company_id) => {
    const executor = client || { query };
    const billsResult = await executor.query(
      `SELECT COALESCE(SUM(balance_due - amount_paid), 0) AS prior_outstanding
       FROM bills
       WHERE organization_id = $1 AND company_id = $2
         AND status IN ('Unpaid', 'Partially Paid');`,
      [organization_id, company_id]
    );
    const companyResult = await executor.query(
      'SELECT opening_balance FROM companies WHERE id = $1 AND organization_id = $2',
      [company_id, organization_id]
    );

    const opening = parseFloat(companyResult.rows[0]?.opening_balance || 0);
    const prior = parseFloat(billsResult.rows[0]?.prior_outstanding || 0);
    return round2(opening + prior);
  },

  /**
   * Allocate the next bill number for this organization.
   * Numbers must not repeat or skip within a tenant, so the counter row is
   * locked for the duration of the generating transaction.
   */
  nextBillNumber: async (client, organization_id) => {
    await client.query(
      `INSERT INTO bill_counters (organization_id, last_number)
       VALUES ($1, 0)
       ON CONFLICT (organization_id) DO NOTHING;`,
      [organization_id]
    );
    const result = await client.query(
      'UPDATE bill_counters SET last_number = last_number + 1 WHERE organization_id = $1 RETURNING last_number;',
      [organization_id]
    );
    const n = result.rows[0].last_number;
    return 'INV-' + String(n).padStart(4, '0');
  },

  /**
   * Generate a bill from a company's unbilled trips.
   *
   * One transaction: lock the eligible trips, snapshot each into bill_items,
   * mark them Billed, and compute the ledger totals. Idempotency is by
   * construction — once billed, trips leave the unbilled pool, so generating
   * again cannot bill the same trip twice.
   *
   * @param {string}   organization_id tenant
   * @param {number}   company_id      company to bill
   * @param {string[]} statuses        trip statuses that count as billable
   * @param {number[]} [trip_ids]      optional explicit subset of trips
   */
  generate: async ({ organization_id, company_id, statuses, trip_ids = null, charge_ids = null, note = null, bill_date = null }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const companyResult = await client.query(
        'SELECT id, name, opening_balance FROM companies WHERE id = $1 AND organization_id = $2 FOR UPDATE;',
        [company_id, organization_id]
      );
      if (companyResult.rows.length === 0) {
        const err = new Error('Company not found.');
        err.statusCode = 404;
        throw err;
      }

      const values = [organization_id, company_id, statuses];
      let sql = `
        SELECT t.id, t.origin, t.destination, t.revenue, t.advance_received,
               t.status, t.billing_status,
               to_char(t.trip_date, 'YYYY-MM-DD') AS trip_date,
               v.registration_number AS vehicle_registration
        FROM trips t
        LEFT JOIN vehicles v ON t.vehicle_id = v.id
        WHERE t.organization_id = $1
          AND t.company_id = $2
          AND t.billing_status = 'Unbilled'
          AND t.status = ANY($3::text[])
          AND t.revenue > 0
      `;
      if (trip_ids && trip_ids.length > 0) {
        sql += ' AND t.id = ANY($4::int[])';
        values.push(trip_ids);
      }
      sql += ' ORDER BY t.trip_date ASC NULLS LAST, t.id ASC FOR UPDATE OF t;';

      const tripsResult = await client.query(sql, values);
      const billableTrips = tripsResult.rows;

      // Charges waiting on the same statement. Locked with the trips so a
      // charge added while a statement is being issued cannot slip in after
      // the totals were computed (or be issued twice).
      const chargeValues = [organization_id, company_id];
      let chargeSql = `
        SELECT id, trip_id, kind, description, amount,
               to_char(charge_date, 'YYYY-MM-DD') AS charge_date
        FROM charges
        WHERE organization_id = $1 AND company_id = $2 AND billing_status = 'Unbilled'
      `;
      if (charge_ids && charge_ids.length > 0) {
        chargeSql += ' AND id = ANY($3::int[])';
        chargeValues.push(charge_ids);
      }
      chargeSql += ' ORDER BY charge_date ASC NULLS LAST, id ASC FOR UPDATE;';

      const chargesResult = await client.query(chargeSql, chargeValues);
      const billableCharges = chargesResult.rows;

      if (billableTrips.length === 0 && billableCharges.length === 0) {
        const err = new Error(
          'Nothing to issue: this company has no unbilled trips in the selected statuses with a fare, and no unbilled charges.'
        );
        err.statusCode = 400;
        throw err;
      }

      const previousBalance = await Bill.getPreviousBalance(client, organization_id, company_id);

      const subtotal = round2(billableTrips.reduce((sum, t) => sum + parseFloat(t.revenue || 0), 0));
      const chargesTotal = round2(
        billableCharges.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0)
      );
      const totalAdvance = round2(
        billableTrips.reduce((sum, t) => sum + parseFloat(t.advance_received || 0), 0)
      );
      // Clamp at zero: per-trip advances can exceed the fares plus any prior
      // outstanding amount. A negative balance_due would be a permanently
      // unpayable statement contradicting its own figures; the excess stays
      // visible in total_advance and is carried forward next time.
      // Ledger (as on the paper statement): previous + fares + charges - advances.
      const balanceDue = Math.max(0, round2(previousBalance + subtotal + chargesTotal - totalAdvance));

      const bill_no = await Bill.nextBillNumber(client, organization_id);

      const billResult = await client.query(
        `INSERT INTO bills (
           organization_id, bill_no, company_id, bill_date, previous_balance,
           subtotal, charges_total, total_advance, balance_due, status, note
         ) VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6, $7, $8, $9, 'Unpaid', $10)
         RETURNING *;`,
        [
          organization_id,
          bill_no,
          company_id,
          bill_date,
          previousBalance,
          subtotal,
          chargesTotal,
          totalAdvance,
          balanceDue,
          note
        ]
      );
      const bill = billResult.rows[0];

      for (const trip of billableTrips) {
        const road = `${trip.origin} to ${trip.destination}`;
        await client.query(
          `INSERT INTO bill_items (
             bill_id, trip_id, trip_date, origin, destination, particulars,
             vehicle_registration, amount, advance
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            bill.id,
            trip.id,
            trip.trip_date,
            trip.origin,
            trip.destination,
            road,
            trip.vehicle_registration,
            round2(trip.revenue),
            round2(trip.advance_received)
          ]
        );
        await client.query(
          `UPDATE trips
           SET billing_status = 'Billed', bill_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3;`,
          [bill.id, trip.id, organization_id]
        );
      }

      for (const charge of billableCharges) {
        await client.query(
          `INSERT INTO bill_charges (bill_id, charge_id, kind, description, amount, charge_date)
           VALUES ($1, $2, $3, $4, $5, $6::date);`,
          [
            bill.id,
            charge.id,
            charge.kind,
            charge.description,
            round2(charge.amount),
            charge.charge_date
          ]
        );
        await client.query(
          `UPDATE charges
           SET billing_status = 'Billed', bill_id = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND organization_id = $3;`,
          [bill.id, charge.id, organization_id]
        );
      }

      await client.query('COMMIT');
      return Bill.findById(bill.id, organization_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Record a payment against a bill and refresh the denormalized totals.
   * Payments beyond the outstanding balance are rejected rather than stored:
   * they would make the ledger contradict itself. A fresh statement (or a
   * credit note) is the right answer to an overpayment.
   */
  recordPayment: async ({ organization_id, bill_id, amount, mode, payment_date, note = null }) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const billResult = await client.query(
        'SELECT * FROM bills WHERE id = $1 AND organization_id = $2 FOR UPDATE;',
        [bill_id, organization_id]
      );
      const bill = billResult.rows[0];
      if (!bill) {
        const err = new Error('Bill not found.');
        err.statusCode = 404;
        throw err;
      }

      const outstanding = remainingOf(bill);
      const payment = round2(amount);

      if (payment > outstanding + 0.001) {
        const err = new Error(
          `Payment exceeds the outstanding balance of Rs ${outstanding.toFixed(2)}.`
        );
        err.statusCode = 400;
        throw err;
      }

      await client.query(
        `INSERT INTO payments (bill_id, amount, mode, payment_date, note)
         VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5);`,
        [bill_id, payment, mode, payment_date, note]
      );

      const paidResult = await client.query(
        'SELECT COALESCE(SUM(amount), 0) AS total_paid FROM payments WHERE bill_id = $1;',
        [bill_id]
      );
      // paidResult already includes the payment inserted above.
      const totalPaid = round2(paidResult.rows[0].total_paid);
      const balanceDue = parseFloat(bill.balance_due);

      let status;
      if (totalPaid >= balanceDue) {
        status = 'Paid';
      } else if (totalPaid > 0) {
        status = 'Partially Paid';
      } else {
        status = 'Unpaid';
      }

      await client.query(
        `UPDATE bills
         SET amount_paid = $1, status = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3;`,
        [totalPaid, status, bill_id]
      );

      await client.query('COMMIT');
      return Bill.findById(bill_id, organization_id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * Void a bill.
   *
   * The row is KEPT and marked Void rather than deleted. Deleting it would
   * free the number — leaving a permanent, unexplainable gap in a GST invoice
   * series — and destroy the record of what the document covered. Its lines
   * (bill_items/bill_charges) stay as the snapshot; its trips and charges go
   * back to the customer's open statement so re-issuing reproduces it.
   *
   * Voided bills drop out of every balance on their own: previous_balance and
   * company outstanding both filter on status IN ('Unpaid','Partially Paid').
   */
  delete: async (id, organization_id, { reason = null, voided_by = null } = {}) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const billResult = await client.query(
        'SELECT * FROM bills WHERE id = $1 AND organization_id = $2 FOR UPDATE;',
        [id, organization_id]
      );
      const bill = billResult.rows[0];
      if (!bill) {
        await client.query('ROLLBACK');
        return null;
      }

      if (bill.status === 'Void') {
        await client.query('ROLLBACK');
        const err = new Error(`Bill ${bill.bill_no} is already voided.`);
        err.statusCode = 409;
        throw err;
      }

      if (parseFloat(bill.amount_paid || 0) > 0) {
        await client.query('ROLLBACK');
        const err = new Error(
          'This bill has payments recorded against it and cannot be voided. Delete the payments first if the bill was raised in error.'
        );
        err.statusCode = 409;
        throw err;
      }

      await client.query(
        `UPDATE trips SET billing_status = 'Unbilled', bill_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE bill_id = $1 AND organization_id = $2;`,
        [id, organization_id]
      );
      // Charges go back to the open statement too, so re-issuing after a void
      // reproduces the same document instead of quietly dropping them.
      await client.query(
        `UPDATE charges SET billing_status = 'Unbilled', bill_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE bill_id = $1 AND organization_id = $2;`,
        [id, organization_id]
      );
      const result = await client.query(
        `UPDATE bills
         SET status = 'Void',
             voided_at = CURRENT_TIMESTAMP,
             void_reason = $3,
             voided_by = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND organization_id = $2
         RETURNING *;`,
        [id, organization_id, reason, voided_by]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      // The early-exit paths above roll back deliberately, so a second
      // ROLLBACK here must not mask the real error.
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // nothing to do: already rolled back
      }
      throw err;
    } finally {
      client.release();
    }
  }
};

module.exports = Bill;
