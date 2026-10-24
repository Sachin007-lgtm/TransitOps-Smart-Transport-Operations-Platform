const Expense = require('../models/expenseModel');
const { query } = require('../config/db');
const { monthlyBillHtml } = require('../utils/monthlyBillHtml');

class ExpenseServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

function toPublicExpense(row) {
  if (!row) return null;
  return {
    ...row,
    recovered: row.recovered_charge_id !== null,
    flag_reasons: Array.isArray(row.flag_reasons) ? row.flag_reasons : (row.flag_reasons ? [row.flag_reasons] : [])
  };
}

// Attach mileage to each fuel entry by comparing its odometer with the
// previous fill on the same vehicle. Rows arrive newest-first, so the delta
// reads backwards: distance_since_prev = how far the truck travelled on that
// tank, km_per_litre = that distance / litres.
function withKmPerLitre(rows) {
  const lastOdo = new Map();
  for (const row of rows) {
    if (row.category !== 'FUEL') continue;
    if (row.odometer != null && row.quantity) {
      const prev = lastOdo.get(row.vehicle_id);
      const delta = prev !== undefined ? prev - row.odometer : null;
      row.distance_since_prev = delta && delta > 0 ? delta : null;
      row.km_per_litre = delta && delta > 0 ? Math.round((delta / Number(row.quantity)) * 100) / 100 : null;
      lastOdo.set(row.vehicle_id, row.odometer);
    } else {
      // A fill without litres (or odometer) carries no mileage, but still
      // moves the odometer chain forward so the next fill's delta stays honest.
      row.distance_since_prev = null;
      row.km_per_litre = null;
      if (!lastOdo.has(row.vehicle_id) || row.odometer != null) {
        lastOdo.set(row.vehicle_id, row.odometer);
      }
    }
  }
  return rows;
}

const expenseService = {
  createExpense: async (payload, user) => {
    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    if (description.length < 3 || description.length > 255) {
      throw new ExpenseServiceError('Describe the expense in 3 to 255 characters.');
    }

    // The vehicle must belong to the caller's organization.
    const vehicle = await query(
      'SELECT id, odometer, fuel_tank_capacity FROM vehicles WHERE id = $1 AND organization_id = $2',
      [payload.vehicle_id, user.organization_id]
    );
    if (vehicle.rows.length === 0) {
      throw new ExpenseServiceError('Vehicle not found in your organization.', 404);
    }

    // Optional trip link must also belong to the caller's organization, and
    // must have run on the same vehicle.
    if (payload.trip_id) {
      const trip = await query(
        'SELECT id, vehicle_id FROM trips WHERE id = $1 AND organization_id = $2',
        [payload.trip_id, user.organization_id]
      );
      if (trip.rows.length === 0) {
        throw new ExpenseServiceError('Trip not found in your organization.', 404);
      }
      if (trip.rows[0].vehicle_id && String(trip.rows[0].vehicle_id) !== String(payload.vehicle_id)) {
        throw new ExpenseServiceError('That trip ran on a different vehicle, so the expense cannot link to it.', 400);
      }
    }

    // Fuel entries: odometer makes the ledger a mileage record, not a receipt
    // pile. Required for FUEL so the analytics always have a reading.
    const isFuel = payload.category === 'FUEL';
    const odometer = isFuel ? payload.odometer : null;
    if (isFuel && (odometer === undefined || odometer === null || Number(odometer) <= 0)) {
      throw new ExpenseServiceError('Fuel entries need the odometer reading from the bill or dash.');
    }

    // A fill made while one of the org's trucks' trips was running on THIS
    // vehicle links to that trip automatically (the Trip column shows where
    // the diesel went) — unless the caller already named a trip.
    let tripId = payload.trip_id || null;
    if (!tripId && isFuel) {
      const fillDate = payload.expense_date || null;
      const running = await query(
        `SELECT id FROM trips
         WHERE organization_id = $1 AND vehicle_id = $2
           AND status IN ('Dispatched', 'Completed')
           AND start_time < COALESCE($3::date, CURRENT_DATE)::timestamptz + INTERVAL '1 day'
           AND COALESCE(actual_arrival, expected_arrival, start_time) >= COALESCE($3::date, CURRENT_DATE)::timestamptz
         LIMIT 1`,
        [user.organization_id, payload.vehicle_id, fillDate]
      );
      if (running.rows.length > 0) tripId = running.rows[0].id;
    }

    // Anti-Fraud & Duplicate Prevention Verification for Fuel Claims
    const flagReasons = [];
    if (isFuel) {
      // Rule 1: Duplicate Invoice / Receipt number check within organization
      if (payload.invoice_number && String(payload.invoice_number).trim()) {
        const dupInv = await Expense.findDuplicateInvoice(user.organization_id, String(payload.invoice_number).trim());
        if (dupInv) {
          flagReasons.push(
            `Duplicate receipt #${String(payload.invoice_number).trim()} already recorded on ${dupInv.expense_date} for vehicle ${dupInv.vehicle_registration} (₹${dupInv.amount}).`
          );
        }
      }

      // Rule 2: Identical claim (same vehicle, vendor, amount within 1 day)
      const dupClaim = await Expense.findDuplicateClaim(
        user.organization_id,
        payload.vehicle_id,
        payload.vendor || null,
        Number(payload.amount),
        payload.expense_date || null
      );
      if (dupClaim) {
        flagReasons.push(
          `Possible duplicate: identical claim of ₹${payload.amount}${payload.vendor ? ` at '${payload.vendor}'` : ''} logged on ${dupClaim.expense_date}.`
        );
      }

      // Rule 3: Odometer sanity & sequence
      const latestFuel = await Expense.findLatestFuelEntry(
        user.organization_id,
        payload.vehicle_id,
        payload.expense_date || null
      );
      if (latestFuel && latestFuel.odometer != null) {
        const prevOdo = Number(latestFuel.odometer);
        const currOdo = Number(odometer);
        if (currOdo <= prevOdo) {
          flagReasons.push(
            `Odometer reading (${currOdo.toLocaleString()} km) is ≤ previous reading (${prevOdo.toLocaleString()} km on ${latestFuel.expense_date}).`
          );
        } else if (payload.quantity && Number(payload.quantity) > 0) {
          const deltaKm = currOdo - prevOdo;
          const kpl = deltaKm / Number(payload.quantity);
          if (kpl < 1.0) {
            flagReasons.push(
              `Abnormally low mileage: ${kpl.toFixed(2)} km/L (${deltaKm} km on ${payload.quantity}L). Possible fuel diversion or incorrect odometer.`
            );
          } else if (kpl > 8.5) {
            flagReasons.push(
              `Unusually high mileage: ${kpl.toFixed(2)} km/L (${deltaKm} km on ${payload.quantity}L). Verify distance and litres.`
            );
          }
        }
      }

      // Rule 4: Tank capacity check
      const tankCapacity = Number(vehicle.rows[0].fuel_tank_capacity) || 300;
      if (payload.quantity && Number(payload.quantity) > tankCapacity) {
        flagReasons.push(
          `Refill of ${payload.quantity}L exceeds vehicle tank capacity (${tankCapacity}L).`
        );
      }

      // Rule 5: Active trip link warning
      if (!tripId) {
        flagReasons.push('Vehicle had no active or scheduled trips around this date.');
      }
    }

    const approvalStatus = flagReasons.length > 0 ? 'Under Review' : 'Approved';

    const created = await Expense.create({
      organization_id: user.organization_id,
      vehicle_id: payload.vehicle_id,
      trip_id: tripId,
      driver_id: payload.driver_id || null,
      category: payload.category,
      description,
      amount: Number(payload.amount),
      expense_date: payload.expense_date || null,
      odometer: odometer !== undefined && odometer !== null ? Number(odometer) : null,
      quantity: isFuel && payload.quantity ? Number(payload.quantity) : null,
      vendor: payload.vendor ? String(payload.vendor).trim() : null,
      payment_mode: payload.payment_mode || 'Cash',
      invoice_number: payload.invoice_number ? String(payload.invoice_number).trim() : null,
      receipt_url: payload.receipt_url ? String(payload.receipt_url).trim() : null,
      approval_status: approvalStatus,
      flag_reasons: flagReasons,
      created_by: user.id || null
    });
    return toPublicExpense(created);
  },

  listExpenses: async (filters, user) => {
    const listFilters = {
      vehicle_id: filters.vehicle_id || null,
      category: filters.category || null,
      from_date: filters.from_date || null,
      to_date: filters.to_date || null,
      approval_status: filters.approval_status || null,
      recovered: filters.recovered === undefined ? null : filters.recovered === 'true',
      limit: filters.limit ? Number(filters.limit) : 200,
      offset: filters.offset ? Number(filters.offset) : 0
    };
    const rows = await Expense.findAll(user.organization_id, listFilters);
    const total = await Expense.count(user.organization_id, listFilters);
    const { EXPENSE_CATEGORIES } = require('../validators/expenseValidator');
    return {
      expenses: withKmPerLitre(rows.map(toPublicExpense)),
      total,
      categories: EXPENSE_CATEGORIES
    };
  },

  reviewExpense: async (id, { action, notes }, user) => {
    if (!['APPROVE', 'REJECT'].includes(action)) {
      throw new ExpenseServiceError("Review action must be 'APPROVE' or 'REJECT'.", 400);
    }
    const existing = await Expense.findById(id, user.organization_id);
    if (!existing) throw new ExpenseServiceError('Expense not found.', 404);

    const approval_status = action === 'APPROVE' ? 'Approved' : 'Rejected';
    const updated = await Expense.review(id, user.organization_id, {
      approval_status,
      reviewed_by: user.id || null,
      review_notes: notes ? String(notes).trim() : null
    });
    return toPublicExpense(updated);
  },

  getExpense: async (id, user) => {
    const row = await Expense.findById(id, user.organization_id);
    if (!row) throw new ExpenseServiceError('Expense not found.', 404);
    return toPublicExpense(row);
  },

  updateExpense: async (id, payload, user) => {
    const existing = await Expense.findById(id, user.organization_id);
    if (!existing) throw new ExpenseServiceError('Expense not found.', 404);

    // A recovered expense feeds a customer statement through its charge: its
    // description/amount/category cannot change here, or the statement would
    // not match the ledger. Correct the charge (billing module) instead.
    if (existing.recovered_charge_id) {
      const locked = ['description', 'amount', 'category'];
      const attempted = Object.keys(payload || {}).filter((k) => locked.includes(k));
      if (attempted.length > 0) {
        throw new ExpenseServiceError(
          `This expense was recovered as charge #${existing.recovered_charge_id}, so its ${attempted.join('/')} cannot change here. ` +
            'Edit the statement charge in Billing instead.',
          409
        );
      }
    }

    const updated = await Expense.update(id, user.organization_id, payload || {});
    if (!updated) throw new ExpenseServiceError('No editable fields in the request.', 400);
    return toPublicExpense(updated);
  },

  deleteExpense: async (id, user) => {
    const existing = await Expense.findById(id, user.organization_id);
    if (!existing) throw new ExpenseServiceError('Expense not found.', 404);

    if (existing.recovered_charge_id) {
      throw new ExpenseServiceError(
        `This expense was recovered as charge #${existing.recovered_charge_id} on a customer statement, so it cannot be deleted. ` +
          'Void that statement first if it was raised in error.',
        409
      );
    }

    return Expense.remove(id, user.organization_id);
  },

  vehicleSummary: async (filters, user) => {
    return Expense.vehicleSummary(
      user.organization_id,
      filters.vehicle_id || null,
      filters.from_date || null,
      filters.to_date || null
    );
  },

  // --- Monthly bill ---------------------------------------------------------
  //
  // One document for a calendar month of the cost ledger: a per-category
  // breakdown (entries, litres, odometer span, spend) plus the full line list.
  // This is an internal statement — it shows what the operation SPENT, not
  // what a customer owes, so there are no advances/payments/balance sections.

  // Resolve 'YYYY-MM' (or a full date) to the month's first/last day. The
  // window is inclusive on both ends, matching how expense_date is compared
  // everywhere else in this module.
  resolveMonthWindow: (month) => {
    const m = String(month || '').match(/^(\d{4})-(\d{2})/);
    if (!m) throw new ExpenseServiceError('Pick a month as YYYY-MM (e.g. 2026-10).');
    const year = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12) throw new ExpenseServiceError('Month must be between 01 and 12.');
    const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return {
      from_date: `${m[1]}-${m[2]}-01`,
      to_date: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`
    };
  },

  getMonthlyBill: async (month, user) => {
    const { from_date, to_date } = expenseService.resolveMonthWindow(month);
    const rows = await Expense.findAll(user.organization_id, { from_date, to_date, limit: null });
    const breakdown = await Expense.monthlyBreakdown(user.organization_id, from_date, to_date);
    return {
      month,
      from_date,
      to_date,
      entries: withKmPerLitre(rows.map(toPublicExpense)),
      breakdown,
      total: breakdown.reduce((acc, b) => acc + (Number(b.total_amount) || 0), 0)
    };
  },

  renderMonthlyBillDocument: async (month, user) => {
    const data = await expenseService.getMonthlyBill(month, user);
    return { data, html: monthlyBillHtml(data) };
  }
};

module.exports = expenseService;
