const express = require('express');
const router = express.Router();

// Fuel is a category of the consolidated expense ledger (migration 021), not
// its own table — one source for every cost report, and fuel-specific
// analytics (km/l, cost per km) come from the odometer + quantity columns.
// These routes are thin aliases over the expense endpoints so the client can
// keep a fuel-shaped URL: every handler forces category=FUEL.

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  validateCreateExpense,
  validateListExpenses
} = require('../validators/expenseValidator');
const {
  createExpense,
  listExpenses,
  vehicleSummary
} = require('../controllers/expenseController');

router.use(authenticate);

const READ_ROLES = ['Owner/Manager', 'Dispatcher', 'Driver'];
const WRITE_ROLES = ['Owner/Manager'];

// Force the category so a fuel URL can never log a non-fuel cost.
const forceFuelCategory = (req, res, next) => {
  req.body = { ...req.body, category: 'FUEL' };
  next();
};

const forceFuelQuery = (req, res, next) => {
  req.query = { ...req.query, category: 'FUEL' };
  next();
};

router.get('/', authorize(READ_ROLES), forceFuelQuery, validateListExpenses, listExpenses);
router.post('/', authorize(WRITE_ROLES), forceFuelCategory, validateCreateExpense, createExpense);
router.get('/summary/vehicles', authorize(READ_ROLES), forceFuelQuery, validateListExpenses, vehicleSummary);

module.exports = router;
