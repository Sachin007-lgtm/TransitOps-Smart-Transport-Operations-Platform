const validate = require('../middleware/validate');

const createTripSchema = {
  source: { required: true, type: 'string' },
  destination: { required: true, type: 'string' },
  vehicle_id: { required: true, type: 'integer', positive: true },
  driver_id: { required: true, type: 'integer', positive: true },
  cargo_weight: { required: true, type: 'number', positive: true },
  planned_distance: { required: true, type: 'number', positive: true },
  revenue: { required: false, type: 'number', positive: true },
  company_id: { required: false, type: 'integer', positive: true },
  trip_date: { required: false, type: 'string' },
  advance_received: { required: false, type: 'number' },
  rate_basis: { required: false, type: 'string' }
};

const updateTripSchema = {
  source: { required: false, type: 'string' },
  destination: { required: false, type: 'string' },
  vehicle_id: { required: false, type: 'integer', positive: true },
  driver_id: { required: false, type: 'integer', positive: true },
  cargo_weight: { required: false, type: 'number', positive: true },
  planned_distance: { required: false, type: 'number', positive: true },
  actual_distance: { required: false, type: 'number', positive: true },
  revenue: { required: false, type: 'number', positive: true },
  status: { required: false, type: 'enum', enum: ['Draft', 'Dispatched', 'Completed', 'Cancelled'] },
  company_id: { required: false, type: 'integer', positive: true },
  trip_date: { required: false, type: 'string' },
  advance_received: { required: false, type: 'number' },
  rate_basis: { required: false, type: 'string' }
};

module.exports = {
  validateCreateTrip: validate(createTripSchema),
  validateUpdateTrip: validate(updateTripSchema)
};
