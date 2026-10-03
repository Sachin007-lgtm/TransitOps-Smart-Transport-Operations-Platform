const expenseService = require('../services/expenseService');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
  // ExpenseServiceError instances carry their own HTTP status code.
  if (err && err.statusCode) {
    return apiResponse.error(res, err.message, err.statusCode);
  }
  console.error('Unexpected Expense Error:', err);
  return apiResponse.error(res, err.message || 'Internal server error.', 500);
};

const createExpense = asyncWrapper(async (req, res) => {
  try {
    const expense = await expenseService.createExpense(req.body, req.user);
    return apiResponse.success(res, expense, 'Expense logged.', 201);
  } catch (err) {
    return handleError(res, err);
  }
});

const listExpenses = asyncWrapper(async (req, res) => {
  try {
    const result = await expenseService.listExpenses(req.query, req.user);
    return apiResponse.success(res, result, 'Expenses fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

const getExpense = asyncWrapper(async (req, res) => {
  try {
    const expense = await expenseService.getExpense(req.params.id, req.user);
    return apiResponse.success(res, expense, 'Expense fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

const updateExpense = asyncWrapper(async (req, res) => {
  try {
    const expense = await expenseService.updateExpense(req.params.id, req.body, req.user);
    return apiResponse.success(res, expense, 'Expense updated.');
  } catch (err) {
    return handleError(res, err);
  }
});

const deleteExpense = asyncWrapper(async (req, res) => {
  try {
    const result = await expenseService.deleteExpense(req.params.id, req.user);
    return apiResponse.success(res, result, 'Expense deleted.');
  } catch (err) {
    return handleError(res, err);
  }
});

const vehicleSummary = asyncWrapper(async (req, res) => {
  try {
    const summary = await expenseService.vehicleSummary(req.query, req.user);
    return apiResponse.success(res, { summary }, 'Vehicle cost summary fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

// The month's cost ledger with its per-category breakdown — the data behind
// the Fuel & Expense page's monthly bill (rendered on demand, not stored).
const getMonthlyBill = asyncWrapper(async (req, res) => {
  try {
    const data = await expenseService.getMonthlyBill(req.query.month, req.user);
    return apiResponse.success(res, data, 'Monthly bill fetched.');
  } catch (err) {
    return handleError(res, err);
  }
});

// Print-ready HTML monthly bill document (printing it yields a paper/PDF bill).
const getMonthlyBillDownload = asyncWrapper(async (req, res) => {
  try {
    const { data, html } = await expenseService.renderMonthlyBillDocument(req.params.month, req.user);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="expense-bill-${data.month}.html"`);
    return res.status(200).send(html);
  } catch (err) {
    return handleError(res, err);
  }
});

module.exports = { createExpense, listExpenses, getExpense, updateExpense, deleteExpense, vehicleSummary, getMonthlyBill, getMonthlyBillDownload };
