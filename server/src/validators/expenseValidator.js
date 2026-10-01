const validate = require('../middleware/validate');

const EXPENSE_CATEGORIES = ['FUEL', 'MAINTENANCE', 'TYRES', 'TOLL', 'INSURANCE', 'PERMIT', 'EMI', 'SALARY', 'GARAGE', 'OTHER'];
const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Fuel Card', 'Other'];

// A negative amount is allowed (a credit or a billing correction); zero is
// not, because a zero expense line is noise in the ledger.
const nonZeroAmount = (val) => (Number(val) === 0 ? 'must not be zero.' : null);

const createExpenseSchema = {
  vehicle_id: { required: true, type: 'uuid' },
  trip_id: { required: false, type: 'uuid' },
  driver_id: { required: false, type: 'uuid' },
  category: { required: true, type: 'enum', enum: EXPENSE_CATEGORIES },
  description: { required: true, type: 'string' },
  amount: { required: true, type: 'number', custom: nonZeroAmount },
  expense_date: { required: false, type: 'date' },
  odometer: { required: false, type: 'number' },
  quantity: { required: false, type: 'number' },
  vendor: { required: false, type: 'string' },
  payment_mode: { required: false, type: 'enum', enum: PAYMENT_MODES }
};

const updateExpenseSchema = {
  vehicle_id: { required: false, type: 'uuid' },
  trip_id: { required: false, type: 'uuid' },
  driver_id: { required: false, type: 'uuid' },
  category: { required: false, type: 'enum', enum: EXPENSE_CATEGORIES },
  description: { required: false, type: 'string' },
  amount: { required: false, type: 'number', custom: nonZeroAmount },
  expense_date: { required: false, type: 'date' },
  odometer: { required: false, type: 'number' },
  quantity: { required: false, type: 'number' },
  vendor: { required: false, type: 'string' },
  payment_mode: { required: false, type: 'enum', enum: PAYMENT_MODES }
};

const listExpensesSchema = {
  vehicle_id: { required: false, type: 'uuid' },
  category: { required: false, type: 'enum', enum: EXPENSE_CATEGORIES },
  from_date: { required: false, type: 'date' },
  to_date: { required: false, type: 'date' },
  recovered: { required: false, type: 'enum', enum: ['true', 'false'] },
  limit: { required: false, type: 'integer', positive: true },
  offset: { required: false, type: 'integer' }
};

module.exports = {
  validateCreateExpense: validate(createExpenseSchema),
  validateUpdateExpense: validate(updateExpenseSchema),
  validateListExpenses: validate(listExpensesSchema),
  EXPENSE_CATEGORIES,
  PAYMENT_MODES
};
