const { billingService, BillingServiceError } = require('../services/billingService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  if (err instanceof BillingServiceError) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  // Business errors raised inside the models (payments beyond the balance,
  // voiding a settled bill, missing rows) carry an HTTP status on the error.
  // Honour it rather than reporting a client mistake as a server fault.
  if (Number.isInteger(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Billing Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error', 500);
};

// --- Companies -----------------------------------------------------------

const createCompany = asyncWrapper(async (req, res) => {
  try {
    const company = await billingService.createCompany(req.user.organization_id, req.body);
    return apiResponse.success(res, company, 'Company created successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const getAllCompanies = asyncWrapper(async (req, res) => {
  try {
    const companies = await billingService.listCompanies(req.user.organization_id);
    return apiResponse.success(res, companies, 'Companies retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getCompanyById = asyncWrapper(async (req, res) => {
  try {
    const company = await billingService.getCompany(req.params.id, req.user.organization_id);
    return apiResponse.success(res, company, 'Company retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const updateCompany = asyncWrapper(async (req, res) => {
  try {
    const company = await billingService.updateCompany(req.params.id, req.user.organization_id, req.body);
    return apiResponse.success(res, company, 'Company updated successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const deleteCompany = asyncWrapper(async (req, res) => {
  try {
    const company = await billingService.deleteCompany(req.params.id, req.user.organization_id);
    return apiResponse.success(res, company, 'Company deleted successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// --- Bills ---------------------------------------------------------------

// The trips a bill for this company would be composed from, plus a breakdown
// of the unbilled trips that are NOT billable yet and why.
const getUnbilledTrips = asyncWrapper(async (req, res) => {
  try {
    const preview = await billingService.getUnbilledPreview(
      req.user.organization_id,
      req.params.companyId,
      req.query.statuses
    );
    return apiResponse.success(res, preview, 'Unbilled trips retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getAllBills = asyncWrapper(async (req, res) => {
  try {
    const bills = await billingService.listBills(req.user.organization_id, req.query);
    return apiResponse.success(res, bills, 'Bills retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getBillById = asyncWrapper(async (req, res) => {
  try {
    const bill = await billingService.getBill(req.params.id, req.user.organization_id);
    return apiResponse.success(res, bill, 'Bill retrieved successfully.');
  } catch (err) {
    return handleError(res, err);
  }
});

// Compose a bill from a company's unbilled trips.
const generateBill = asyncWrapper(async (req, res) => {
  try {
    const bill = await billingService.generateBill(req.user.organization_id, req.body);
    return apiResponse.success(res, bill, `Bill ${bill.bill_no} generated successfully.`, 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const recordPayment = asyncWrapper(async (req, res) => {
  try {
    const bill = await billingService.recordPayment(req.user.organization_id, req.params.id, req.body);
    return apiResponse.success(res, bill, 'Payment recorded successfully.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const deleteBill = asyncWrapper(async (req, res) => {
  try {
    const deleted = await billingService.voidBill(req.params.id, req.user.organization_id);
    return apiResponse.success(
      res,
      deleted,
      `Bill ${deleted.bill_no} voided; its trips are back in the unbilled pool.`
    );
  } catch (err) {
    return handleError(res, err);
  }
});

// Print-ready HTML bill document (printing it yields a paper/PDF bill).
const getBillDownload = asyncWrapper(async (req, res) => {
  try {
    const { bill, html } = await billingService.renderBillDocument(req.params.id, req.user.organization_id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${bill.bill_no}.html"`);
    return res.status(200).send(html);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = {
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getUnbilledTrips,
  getAllBills,
  getBillById,
  generateBill,
  recordPayment,
  deleteBill,
  getBillDownload
};
