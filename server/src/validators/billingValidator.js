const validate = require('../middleware/validate');

const PAYMENT_MODES = ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other'];
const TRIP_STATUSES = ['Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed'];

// The shared `validate` middleware only type-checks scalars, so array-shaped
// fields are enforced through `custom` rules below.
const isStatusList = (val) => {
  if (!Array.isArray(val)) return 'must be an array of trip statuses.';
  if (val.length === 0) return 'must list at least one trip status.';
  const unknown = val.filter((s) => !TRIP_STATUSES.includes(s));
  if (unknown.length > 0) return `contains unknown status(es): ${unknown.join(', ')}.`;
  if (val.includes('Cancelled')) return 'cannot include Cancelled — cancelled trips are never billable.';
  return null;
};

// Mirrors the UUID rule in middleware/validate.js for the array shapes that
// middleware cannot type-check. Ids are UUIDs repo-wide.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isIdList = (val) => {
  if (!Array.isArray(val)) return 'must be an array of ids.';
  if (val.some((id) => typeof id !== 'string' || !UUID_REGEX.test(id.trim()))) {
    return 'must contain UUID ids.';
  }
  return null;
};

const createCompanySchema = {
  name: { required: true, type: 'string' },
  contact_person: { required: false, type: 'string' },
  email: { required: false, type: 'string' },
  phone: { required: false, type: 'string' },
  address: { required: false, type: 'string' },
  gstin: { required: false, type: 'string' },
  opening_balance: { required: false, type: 'number' },
  status: { required: false, type: 'enum', enum: ['Active', 'Inactive'] }
};

const updateCompanySchema = {
  name: { required: false, type: 'string' },
  contact_person: { required: false, type: 'string' },
  email: { required: false, type: 'string' },
  phone: { required: false, type: 'string' },
  address: { required: false, type: 'string' },
  gstin: { required: false, type: 'string' },
  opening_balance: { required: false, type: 'number' },
  status: { required: false, type: 'enum', enum: ['Active', 'Inactive'] }
};

const generateBillSchema = {
  company_id: { required: true, type: 'uuid' },
  note: { required: false, type: 'string' },
  bill_date: { required: false, type: 'date' },
  statuses: { required: false, custom: isStatusList },
  trip_ids: { required: false, custom: isIdList },
  charge_ids: { required: false, custom: isIdList }
};

const recordPaymentSchema = {
  amount: { required: true, type: 'number', positive: true },
  mode: { required: true, type: 'enum', enum: PAYMENT_MODES },
  payment_date: { required: false, type: 'date' },
  note: { required: false, type: 'string' }
};

module.exports = {
  validateCreateCompany: validate(createCompanySchema),
  validateUpdateCompany: validate(updateCompanySchema),
  validateGenerateBill: validate(generateBillSchema),
  validateRecordPayment: validate(recordPaymentSchema)
};
