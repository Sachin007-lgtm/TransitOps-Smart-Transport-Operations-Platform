const Company = require('../models/companyModel');
const Bill = require('../models/billModel');
const Trip = require('../models/tripModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');
const { numberToWords } = require('../utils/amountInWords');
const { billHtml } = require('../utils/billHtml');

// --- Companies ---

const createCompany = asyncWrapper(async (req, res) => {
  const company = await Company.create(req.body);
  return apiResponse.success(res, company, 'Company created successfully.', 201);
});

const getAllCompanies = asyncWrapper(async (req, res) => {
  const companies = await Company.findAll();
  return apiResponse.success(res, companies, 'Companies retrieved successfully.');
});

const getCompanyById = asyncWrapper(async (req, res) => {
  const company = await Company.findById(req.params.id);
  if (!company) {
    return apiResponse.error(res, 'Company not found.', 404);
  }
  const unbilledTrips = await Bill.findUnbilledTrips(req.params.id);
  return apiResponse.success(res, { ...company, unbilled_trips: unbilledTrips }, 'Company retrieved successfully.');
});

const updateCompany = asyncWrapper(async (req, res) => {
  const updated = await Company.update(req.params.id, req.body);
  if (!updated) {
    return apiResponse.error(res, 'Company not found or no changes made.', 404);
  }
  return apiResponse.success(res, updated, 'Company updated successfully.');
});

const deleteCompany = asyncWrapper(async (req, res) => {
  try {
    const deleted = await Company.delete(req.params.id);
    if (!deleted) {
      return apiResponse.error(res, 'Company not found.', 404);
    }
    return apiResponse.success(res, deleted, 'Company deleted successfully.');
  } catch (err) {
    // FK RESTRICT from bills trips — company still has billing history.
    if (err.code === '23503') {
      return apiResponse.error(res, 'Company has bills or trips and cannot be deleted. Mark it Inactive instead.', 409);
    }
    throw err;
  }
});

// --- Bills ---

const getAllBills = asyncWrapper(async (req, res) => {
  const { company_id, status } = req.query;
  const bills = await Bill.findAll({ company_id, status });
  return apiResponse.success(res, bills, 'Bills retrieved successfully.');
});

const getBillById = asyncWrapper(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) {
    return apiResponse.error(res, 'Bill not found.', 404);
  }
  // Amount in words, Indian convention (lakh/crore), as on GST-format bills.
  // Words describe the OUTSTANDING balance (what is still owed after
  // payments) — the figure the owner quotes when following up.
  const remaining = Math.max(
    0, parseFloat(bill.balance_due) - parseFloat(bill.amount_paid || 0)
  );
  return apiResponse.success(res, {
    ...bill,
    remaining_balance: remaining,
    balance_due_in_words: numberToWords(bill.balance_due),
    remaining_balance_in_words: numberToWords(remaining)
  }, 'Bill retrieved successfully.');
});

// Download a print-ready HTML bill document (opens in any browser;
// printing it yields a paper/PDF bill).
const getBillDownload = asyncWrapper(async (req, res) => {
  const bill = await Bill.findById(req.params.id);
  if (!bill) {
    return apiResponse.error(res, 'Bill not found.', 404);
  }
  const html = billHtml(bill);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${bill.bill_no}.html"`);
  return res.status(200).send(html);
});

const generateBill = asyncWrapper(async (req, res) => {
  const bill = await Bill.generate(req.body);
  const words = numberToWords(bill.balance_due);
  return apiResponse.success(res, {
    ...bill,
    remaining_balance: Math.max(0, parseFloat(bill.balance_due) - parseFloat(bill.amount_paid || 0)),
    balance_due_in_words: words,
    remaining_balance_in_words: words
  }, `Bill ${bill.bill_no} generated successfully.`, 201);
});

const recordPayment = asyncWrapper(async (req, res) => {
  const { amount, mode, payment_date, note } = req.body;
  const bill = await Bill.recordPayment({
    bill_id: parseInt(req.params.id, 10),
    amount,
    mode,
    payment_date: payment_date || new Date().toISOString().slice(0, 10),
    note
  });
  return apiResponse.success(res, bill, 'Payment recorded successfully.', 201);
});

const deleteBill = asyncWrapper(async (req, res) => {
  const deleted = await Bill.delete(req.params.id);
  if (!deleted) {
    return apiResponse.error(res, 'Bill not found.', 404);
  }
  return apiResponse.success(res, deleted, 'Bill deleted; its trips returned to the unbilled pool.');
});

// Unbilled completed trips for a company (preview before generating).
const getUnbilledTrips = asyncWrapper(async (req, res) => {
  const trips = await Bill.findUnbilledTrips(req.params.companyId);
  return apiResponse.success(res, trips, 'Unbilled trips retrieved successfully.');
});

// Assign an existing trip to a company (so completed trips become billable).
const assignTripToCompany = asyncWrapper(async (req, res) => {
  const { company_id } = req.body;
  if (!company_id) {
    return apiResponse.error(res, 'company_id is required.', 400);
  }
  const updated = await Trip.update(req.params.tripId, { company_id });
  if (!updated) {
    return apiResponse.error(res, 'Trip not found or no changes made.', 404);
  }
  return apiResponse.success(res, updated, 'Trip assigned to company successfully.');
});

module.exports = {
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getAllBills,
  getBillById,
  getBillDownload,
  generateBill,
  recordPayment,
  deleteBill,
  getUnbilledTrips,
  assignTripToCompany
};
