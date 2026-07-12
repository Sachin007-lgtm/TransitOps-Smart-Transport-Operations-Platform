const validate = require('../middleware/validate');

const createFuelSchema = {
  vehicle_id: { required: true, type: 'integer', positive: true },
  trip_id: { required: false, type: 'integer', positive: true },
  liters: { required: true, type: 'number', positive: true },
  cost: { required: true, type: 'number', positive: true },
  date: { required: false, type: 'string' }
};

const updateFuelSchema = {
  vehicle_id: { required: false, type: 'integer', positive: true },
  trip_id: { required: false, type: 'integer', positive: true },
  liters: { required: false, type: 'number', positive: true },
  cost: { required: false, type: 'number', positive: true },
  date: { required: false, type: 'string' }
};

module.exports = {
  validateCreateFuel: validate(createFuelSchema),
  validateUpdateFuel: validate(updateFuelSchema)
};
