const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  validateCreateExpense,
  validateUpdateExpense,
  validateListExpenses
} = require('../validators/expenseValidator');
const {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  vehicleSummary
} = require('../controllers/expenseController');

// All expense endpoints require a valid JWT; tenant scoping happens in the
// service layer through organization_id.
router.use(authenticate);

// Everyone who runs or books transport work can read the cost ledger; only
// Owner/Manager may change money (mirrors the billing roles).
const READ_ROLES = ['Owner/Manager', 'Dispatcher', 'Driver'];
const WRITE_ROLES = ['Owner/Manager'];

router.route('/')
  .get(authorize(READ_ROLES), validateListExpenses, listExpenses)
  .post(authorize(WRITE_ROLES), validateCreateExpense, createExpense);

router.get('/summary/vehicles', authorize(READ_ROLES), validateListExpenses, vehicleSummary);

router.route('/:id')
  .get(authorize(READ_ROLES), getExpense)
  .patch(authorize(WRITE_ROLES), validateUpdateExpense, updateExpense)
  .put(authorize(WRITE_ROLES), validateUpdateExpense, updateExpense)
  .delete(authorize(WRITE_ROLES), deleteExpense);

module.exports = router;
