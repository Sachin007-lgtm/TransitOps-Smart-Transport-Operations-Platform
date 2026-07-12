const express = require('express');
const router = express.Router();
const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense
} = require('../controllers/expenseController');
const { validateCreateExpense, validateUpdateExpense } = require('../validators/expenseValidator');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

// Require authentication for all routes
router.use(authenticate);

router.route('/')
  .get(authorize(), getAllExpenses)
  .post(authorize('Fleet Manager', 'Driver'), validateCreateExpense, createExpense);

router.route('/:id')
  .get(authorize(), getExpenseById)
  .put(authorize('Fleet Manager', 'Financial Analyst'), validateUpdateExpense, updateExpense)
  .delete(authorize('Fleet Manager', 'Financial Analyst'), deleteExpense);

module.exports = router;
