const Expense = require('../models/expenseModel');
const Vehicle = require('../models/vehicleModel');
const Trip = require('../models/tripModel');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const createExpense = asyncWrapper(async (req, res) => {
  const { vehicle_id, trip_id } = req.body;

  if (vehicle_id) {
    const vehicle = await Vehicle.findById(vehicle_id);
    if (!vehicle) {
      return apiResponse.error(res, 'Vehicle not found.', 404);
    }
  }

  if (trip_id) {
    const trip = await Trip.findById(trip_id);
    if (!trip) {
      return apiResponse.error(res, 'Trip not found.', 404);
    }
  }

  const newExpense = await Expense.create(req.body);
  return apiResponse.success(res, newExpense, 'Expense logged successfully.', 201);
});

const getAllExpenses = asyncWrapper(async (req, res) => {
  const { vehicle_id, trip_id } = req.query;
  const expenses = await Expense.findAll({ vehicle_id, trip_id });
  return apiResponse.success(res, expenses, 'Expenses retrieved successfully.');
});

const getExpenseById = asyncWrapper(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) {
    return apiResponse.error(res, 'Expense not found.', 404);
  }
  return apiResponse.success(res, expense, 'Expense retrieved successfully.');
});

const updateExpense = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const existingExpense = await Expense.findById(id);
  
  if (!existingExpense) {
    return apiResponse.error(res, 'Expense not found.', 404);
  }

  const updatedExpense = await Expense.update(id, req.body);
  if (!updatedExpense) {
    return apiResponse.error(res, 'No changes made.', 400);
  }
  return apiResponse.success(res, updatedExpense, 'Expense updated successfully.');
});

const deleteExpense = asyncWrapper(async (req, res) => {
  const deletedExpense = await Expense.delete(req.params.id);
  if (!deletedExpense) {
    return apiResponse.error(res, 'Expense not found.', 404);
  }
  return apiResponse.success(res, deletedExpense, 'Expense deleted successfully.');
});

module.exports = {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense
};
