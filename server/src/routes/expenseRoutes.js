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

// All expense routes require authentication
router.use(authenticate);

router.route('/')
  .post(authorize('Fleet Manager', 'Financial Analyst'), validateCreateExpense, createExpense)
  .get(authorize('Fleet Manager', 'Financial Analyst', 'Driver'), getAllExpenses);

router.route('/:id')
  .get(authorize('Fleet Manager', 'Financial Analyst', 'Driver'), getExpenseById)
  .put(authorize('Fleet Manager', 'Financial Analyst'), validateUpdateExpense, updateExpense)
  .delete(authorize('Fleet Manager', 'Financial Analyst'), deleteExpense);

module.exports = router;
