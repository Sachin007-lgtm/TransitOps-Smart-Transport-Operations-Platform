const validate = require('../middleware/validate');

// The shared validate middleware's `positive` rule rejects zero, but an
// advance of zero is legitimate (a trip billed before any money was received),
// so only negatives are rejected here.
const notNegative = (label) => (val) => (Number(val) < 0 ? `${label} must not be negative.` : null);


const normalizeOrigin = (req, res, next) => {
  if (!req.body.origin && req.body.source) {
    req.body.origin = req.body.source;
  }
  next();
};

const createTripSchema = {
  origin: { required: true, type: 'string' },
  destination: { required: true, type: 'string' },
  planned_route: { required: true, type: 'string' },
  start_time: { required: true, type: 'date' },
  expected_arrival: {
    required: true,
    type: 'date',
    custom: (val, body) => {
      if (body.start_time && new Date(val) <= new Date(body.start_time)) {
        return 'expected_arrival must be after start_time.';
      }
      return null;
    }
  },
  vehicle_id: { required: false, type: 'integer', positive: true },
  driver_id: { required: false, type: 'integer', positive: true },
  external_party_name: { required: false, type: 'string' },
  external_party_type: { required: false, type: 'enum', enum: ['CUSTOMER', 'AGENCY'] },
  cargo_weight: { required: false, type: 'number' },
  revenue: { required: false, type: 'number' },
  status: { required: false, type: 'enum', enum: ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed', 'Cancelled'] },
  // Billing fields (see billingValidator for the company/bill side).
  company_id: { required: false, type: 'integer', positive: true },
  trip_date: { required: false, type: 'date' },
  advance_received: { required: false, type: 'number', custom: notNegative('advance_received') }
};

const updateTripSchema = {
  origin: { required: false, type: 'string' },
  destination: { required: false, type: 'string' },
  planned_route: { required: false, type: 'string' },
  start_time: { required: false, type: 'date' },
  expected_arrival: {
    required: false,
    type: 'date',
    custom: (val, body) => {
      if (body.start_time && new Date(val) <= new Date(body.start_time)) {
        return 'expected_arrival must be after start_time.';
      }
      return null;
    }
  },
  vehicle_id: { required: false, type: 'integer', positive: true },
  driver_id: { required: false, type: 'integer', positive: true },
  external_party_name: { required: false, type: 'string' },
  external_party_type: { required: false, type: 'enum', enum: ['CUSTOMER', 'AGENCY'] },
  cargo_weight: { required: false, type: 'number' },
  actual_distance: { required: false, type: 'number' },
  revenue: { required: false, type: 'number' },
  company_id: { required: false, type: 'integer', positive: true },
  trip_date: { required: false, type: 'date' },
  advance_received: { required: false, type: 'number', custom: notNegative('advance_received') }
};

const updateTripStatusSchema = {
  status: {
    required: true,
    type: 'enum',
    enum: ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed', 'Cancelled']
  },
  actual_arrival: { required: false, type: 'date' },
  actual_distance: { required: false, type: 'number' }
};

module.exports = {
  validateCreateTrip: [normalizeOrigin, validate(createTripSchema)],
  validateUpdateTrip: [normalizeOrigin, validate(updateTripSchema)],
  validateUpdateTripStatus: [validate(updateTripStatusSchema)]
};
