const validate = require('../middleware/validate');

const createExpenseSchema = {
  vehicle_id: { required: true, type: 'integer', positive: true },
  trip_id: { required: false, type: 'integer', positive: true },
  description: { required: true, type: 'string' },
  amount: { required: true, type: 'number', positive: true },
  date: { required: false, type: 'string' }
};

const updateExpenseSchema = {
  vehicle_id: { required: false, type: 'integer', positive: true },
  trip_id: { required: false, type: 'integer', positive: true },
  description: { required: false, type: 'string' },
  amount: { required: false, type: 'number', positive: true },
  date: { required: false, type: 'string' }
};

module.exports = {
  validateCreateExpense: validate(createExpenseSchema),
  validateUpdateExpense: validate(updateExpenseSchema)
};
