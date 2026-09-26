const validate = require('../middleware/validate');

const CHARGE_KINDS = ['TOLL', 'LOADING', 'UNLOADING', 'DETENTION', 'DRIVER_ALLOWANCE', 'MISC'];

// A charge is never zero (a zero line is noise on a statement) but may be
// negative, for a credit or a rate correction.
const nonZeroAmount = (val) => (Number(val) === 0 ? 'must not be zero.' : null);

const createChargeSchema = {
  description: { required: true, type: 'string' },
  amount: { required: true, type: 'number', custom: nonZeroAmount },
  kind: { required: false, type: 'enum', enum: CHARGE_KINDS },
  charge_date: { required: false, type: 'date' },
  trip_id: { required: false, type: 'integer', positive: true }
};

const updateChargeSchema = {
  description: { required: false, type: 'string' },
  amount: { required: false, type: 'number', custom: nonZeroAmount },
  kind: { required: false, type: 'enum', enum: CHARGE_KINDS },
  charge_date: { required: false, type: 'date' },
  trip_id: { required: false, type: 'integer', positive: true }
};

// The shared validate middleware only type-checks scalars, so the id lists are
// enforced through `custom` rules.
const isIdList = (val) => {
  if (!Array.isArray(val)) return 'must be an array of ids.';
  if (val.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
    return 'must contain positive ids.';
  }
  return null;
};

module.exports = {
  validateCreateCharge: validate(createChargeSchema),
  validateUpdateCharge: validate(updateChargeSchema),
  validateIdList: isIdList,
  CHARGE_KINDS
};
