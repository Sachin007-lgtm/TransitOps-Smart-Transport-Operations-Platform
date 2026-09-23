const Company = require('../models/companyModel');
const Bill = require('../models/billModel');
const { billHtml } = require('../utils/billHtml');

class BillingServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Trips in these statuses are billable by default: the work is finished and
 * the fare is earned. A caller may widen the list explicitly (e.g. bill a
 * dispatched-but-not-yet-closed trip), but a Cancelled trip is never billable.
 */
const DEFAULT_BILLABLE_STATUSES = ['Completed'];

const TRIP_STATUSES = ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed'];

/**
 * Validate and de-duplicate a caller-supplied list of billable trip statuses.
 */
function normalizeStatuses(input) {
  if (input === undefined || input === null) return DEFAULT_BILLABLE_STATUSES;

  // Accepts a JSON array (request body) or a comma-separated string (query
  // string, e.g. ?statuses=Completed,Dispatched).
  let list;
  if (Array.isArray(input)) {
    list = input;
  } else if (typeof input === 'string') {
    list = input.split(',');
  } else {
    list = [input];
  }

  const cleaned = [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];

  if (cleaned.length === 0) return DEFAULT_BILLABLE_STATUSES;

  const unknown = cleaned.filter((s) => !TRIP_STATUSES.includes(s));
  if (unknown.length > 0) {
    throw new BillingServiceError(`Unknown trip status: ${unknown.join(', ')}.`, 400);
  }
  if (cleaned.includes('Cancelled')) {
    throw new BillingServiceError('Cancelled trips can never be billed.', 400);
  }
  return cleaned;
}

function round2(n) {
  return Math.round((parseFloat(n) || 0) * 100) / 100;
}

/**
 * Split a company's unbilled trips into what a bill can be composed from
 * right now, what is waiting for the work to finish, and what has no fare.
 *
 * The split is what makes "generate bill" honest: instead of silently
 * ignoring trips the owner expects to see, the preview reports exactly which
 * trips are billable and why the rest are not.
 */
function buildPool(trips, statuses) {
  const billable = [];
  const waiting = [];
  const unpriced = [];

  for (const trip of trips) {
    if (round2(trip.revenue) <= 0) {
      unpriced.push(trip);
      continue;
    }
    if (statuses.includes(trip.status)) {
      billable.push(trip);
    } else {
      waiting.push(trip);
    }
  }

  const sumOf = (rows, field) => round2(rows.reduce((sum, r) => sum + parseFloat(r[field] || 0), 0));

  return {
    billable_statuses: statuses,
    billable,
    waiting,
    unpriced,
    totals: {
      billable_count: billable.length,
      billable_amount: sumOf(billable, 'revenue'),
      billable_advance: sumOf(billable, 'advance_received'),
      waiting_count: waiting.length,
      waiting_amount: sumOf(waiting, 'revenue'),
      unpriced_count: unpriced.length
    }
  };
}

const billingService = {
  // --- Companies ---------------------------------------------------------

  listCompanies: async (orgId) => Company.findAll(orgId),

  createCompany: async (orgId, payload) => {
    try {
      return await Company.create({ ...payload, organization_id: orgId });
    } catch (err) {
      if (err.code === '23505') {
        throw new BillingServiceError(
          `A company named "${payload.name}" already exists for this organization.`,
          409
        );
      }
      throw err;
    }
  },

  getCompany: async (id, orgId) => {
    const company = await Company.findById(id, orgId);
    if (!company) throw new BillingServiceError('Company not found.', 404);
    const trips = await Bill.findUnbilledTrips(orgId, id);
    return { ...company, unbilled: buildPool(trips, DEFAULT_BILLABLE_STATUSES) };
  },

  updateCompany: async (id, orgId, payload) => {
    try {
      const updated = await Company.update(id, payload, orgId);
      if (!updated) throw new BillingServiceError('Company not found or no changes made.', 404);
      return updated;
    } catch (err) {
      if (err.code === '23505') {
        throw new BillingServiceError(
          `Another company named "${payload.name}" already exists for this organization.`,
          409
        );
      }
      throw err;
    }
  },

  deleteCompany: async (id, orgId) => {
    let deleted;
    try {
      deleted = await Company.delete(id, orgId);
    } catch (err) {
      // trips_company_id_fkey is ON DELETE SET NULL, but bills RESTRICT: a
      // company with billing history must stay on record.
      if (err.code === '23503') {
        throw new BillingServiceError(
          'This company has bills and cannot be deleted. Mark it Inactive instead.',
          409
        );
      }
      throw err;
    }
    if (!deleted) throw new BillingServiceError('Company not found.', 404);
    return deleted;
  },

  // --- Bills -------------------------------------------------------------

  /**
   * Preview of the trips a bill for this company would be composed from.
   */
  getUnbilledPreview: async (orgId, companyId, statusesInput) => {
    const statuses = normalizeStatuses(statusesInput);
    const company = await Company.findById(companyId, orgId);
    if (!company) throw new BillingServiceError('Company not found.', 404);

    const trips = await Bill.findUnbilledTrips(orgId, companyId);
    const pool = buildPool(trips, statuses);
    const previousBalance = await Bill.getPreviousBalance(null, orgId, companyId);

    return {
      company: { id: company.id, name: company.name, opening_balance: company.opening_balance },
      previous_balance: previousBalance,
      ...pool,
      // What the bill would say if it were generated from everything billable.
      projected: {
        subtotal: pool.totals.billable_amount,
        total_advance: pool.totals.billable_advance,
        balance_due: Math.max(
          0,
          round2(previousBalance + pool.totals.billable_amount - pool.totals.billable_advance)
        )
      }
    };
  },

  listBills: async (orgId, { company_id, status } = {}) =>
    Bill.findAll({
      organization_id: orgId,
      company_id: company_id ? Number(company_id) : undefined,
      status
    }),

  getBill: async (id, orgId) => {
    const bill = await Bill.findById(id, orgId);
    if (!bill) throw new BillingServiceError('Bill not found.', 404);
    return bill;
  },

  generateBill: async (orgId, { company_id, statuses, trip_ids, note, bill_date }) => {
    const allowed = normalizeStatuses(statuses);

    // Ownership first: a company belonging to another organization must read
    // as "not found" (404), never as "nothing to bill" (400), which would
    // confirm the row exists to a stranger.
    const company = await Company.findById(Number(company_id), orgId);
    if (!company) throw new BillingServiceError('Company not found.', 404);

    // Same pool the preview showed, so an empty bill explains itself rather
    // than failing with a generic message.
    const trips = await Bill.findUnbilledTrips(orgId, Number(company_id));
    const pool = buildPool(trips, allowed);

    if (pool.billable.length === 0) {
      if (pool.waiting.length > 0) {
        throw new BillingServiceError(
          `${pool.waiting.length} unbilled trip(s) for this company are not in a billable status yet ` +
            `(currently billable: ${allowed.join(', ')}). Complete them, or include their status when generating.`,
          400
        );
      }
      if (pool.unpriced.length > 0 && pool.billable.length === 0) {
        throw new BillingServiceError(
          `${pool.unpriced.length} unbilled trip(s) for this company have no fare, so there is nothing to bill.`,
          400
        );
      }
      throw new BillingServiceError(
        'Nothing to bill: this company has no unbilled trips left.',
        400
      );
    }

    return Bill.generate({
      organization_id: orgId,
      company_id: Number(company_id),
      statuses: allowed,
      trip_ids: Array.isArray(trip_ids) && trip_ids.length > 0 ? trip_ids.map(Number) : null,
      note: note || null,
      bill_date: bill_date || null
    });
  },

  recordPayment: async (orgId, billId, { amount, mode, payment_date, note }) =>
    Bill.recordPayment({
      organization_id: orgId,
      bill_id: Number(billId),
      amount,
      mode,
      payment_date: payment_date || null,
      note: note || null
    }),

  voidBill: async (id, orgId) => {
    const deleted = await Bill.delete(id, orgId);
    if (!deleted) throw new BillingServiceError('Bill not found.', 404);
    return deleted;
  },

  /**
   * Print-ready HTML document for a bill (printing it yields a paper/PDF bill).
   */
  renderBillDocument: async (id, orgId) => {
    const bill = await Bill.findById(id, orgId);
    if (!bill) throw new BillingServiceError('Bill not found.', 404);
    return { bill, html: billHtml(bill) };
  }
};

module.exports = { billingService, BillingServiceError, DEFAULT_BILLABLE_STATUSES };
