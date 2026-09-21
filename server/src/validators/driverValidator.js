const validate = require('../middleware/validate');

// Valid license categories per international & local standards
const LICENSE_CATEGORIES = ['A', 'A1', 'A2', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E', 'LMV', 'HMV', 'MCWG'];

// Schema used for POST /api/drivers
const createDriverSchema = {
  name: {
    required: true,
    type: 'string',
    custom: (val) => (!val || !val.trim() ? 'name cannot be empty.' : null)
  },
  license_number: {
    required: true,
    type: 'string',
    custom: (val) => (!val || !val.trim() || val.trim().length < 3 ? 'license_number must be at least 3 characters.' : null)
  },
  license_category: {
    required: false,
    type: 'string'
  },
  license_expiry_date: {
    required: true,
    type: 'date'
  },
  contact_number: {
    required: true,
    type: 'string',
    custom: (val) => {
      const digits = (val || '').replace(/\D/g, '');
      if (digits.length < 10) return 'contact_number must contain at least 10 digits.';
      return null;
    }
  },
  safety_score: {
    required: false,
    type: 'number',
    custom: (val) => (val !== undefined && (val < 0 || val > 100) ? 'safety_score must be between 0 and 100.' : null)
  },
  status: {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'Off Duty', 'Suspended']
  }
};

// Schema used for PUT /api/drivers/:id
const updateDriverSchema = {
  name: {
    required: false,
    type: 'string',
    custom: (val) => (val !== undefined && !val.trim() ? 'name cannot be empty.' : null)
  },
  license_number: {
    required: false,
    type: 'string',
    custom: (val) => (val !== undefined && (!val.trim() || val.trim().length < 3) ? 'license_number must be at least 3 characters.' : null)
  },
  license_category: {
    required: false,
    type: 'string'
  },
  license_expiry_date: {
    required: false,
    type: 'date'
  },
  contact_number: {
    required: false,
    type: 'string',
    custom: (val) => {
      if (val === undefined) return null;
      const digits = (val || '').replace(/\D/g, '');
      if (digits.length < 10) return 'contact_number must contain at least 10 digits.';
      return null;
    }
  },
  safety_score: {
    required: false,
    type: 'number',
    custom: (val) => (val !== undefined && (val < 0 || val > 100) ? 'safety_score must be between 0 and 100.' : null)
  },
  status: {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'Off Duty', 'Suspended']
  }
};

// Schema used for PATCH /api/drivers/:id/status
const updateDriverStatusSchema = {
  status: {
    required: true,
    type: 'enum',
    enum: ['Available', 'On Trip', 'Off Duty', 'Suspended']
  }
};

module.exports = {
  validateCreateDriver: validate(createDriverSchema),
  validateUpdateDriver: validate(updateDriverSchema),
  validateDriverStatus: validate(updateDriverStatusSchema),
  LICENSE_CATEGORIES
};
