const Expense = require('../models/expenseModel');
const { query } = require('../config/db');

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
    recovered: row.recovered_charge_id !== null
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
      'SELECT id, odometer FROM vehicles WHERE id = $1 AND organization_id = $2',
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
      // Only stamp created_by when the caller is a real users row; test tokens
      // and synthetic identities have no row, and the FK would reject them.
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
  }
};

module.exports = expenseService;
