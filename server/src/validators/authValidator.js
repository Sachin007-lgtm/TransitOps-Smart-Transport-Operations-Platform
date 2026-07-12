const validate = require('../middleware/validate');

// Schema used for POST /api/auth/login
const loginSchema = {
  email:    { required: true, type: 'string' },
  password: { required: true, type: 'string' }
};

module.exports = {
  validateLogin: validate(loginSchema)
};
