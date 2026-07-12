const validate = require('../middleware/validate');

// Valid license categories per international standard
const LICENSE_CATEGORIES = ['A', 'A1', 'A2', 'B', 'B1', 'BE', 'C', 'C1', 'CE', 'C1E', 'D', 'D1', 'DE', 'D1E'];

// Schema used for POST /api/drivers
const createDriverSchema = {
  name:                 { required: true,  type: 'string' },
  license_number:       { required: true,  type: 'string' },
  license_category:     { required: true,  type: 'enum', enum: LICENSE_CATEGORIES },
  license_expiry_date:  { required: true,  type: 'string' },
  contact_number:       { required: true,  type: 'string' },
  safety_score:         { required: false, type: 'integer' },
  status:               {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'Off Duty', 'Suspended']
  }
};

// Schema used for PUT /api/drivers/:id
const updateDriverSchema = {
  name:                 { required: false, type: 'string' },
  license_number:       { required: false, type: 'string' },
  license_category:     { required: false, type: 'enum', enum: LICENSE_CATEGORIES },
  license_expiry_date:  { required: false, type: 'string' },
  contact_number:       { required: false, type: 'string' },
  safety_score:         { required: false, type: 'integer' },
  status:               {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'Off Duty', 'Suspended']
  }
};

module.exports = {
  validateCreateDriver: validate(createDriverSchema),
  validateUpdateDriver: validate(updateDriverSchema),
  LICENSE_CATEGORIES
};
