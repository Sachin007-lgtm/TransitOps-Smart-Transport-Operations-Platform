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

module.exports = { createExpense, listExpenses, getExpense, updateExpense, deleteExpense, vehicleSummary };
