const validate = require('../middleware/validate');

// Schema used for POST /api/vehicles
const createVehicleSchema = {
  registration_number: { required: true,  type: 'string' },
  name:                { required: true,  type: 'string' },
  type:                { required: true,  type: 'string' },
  max_load_capacity:   { required: true,  type: 'number', positive: true },
  odometer:            { required: false, type: 'number', positive: true },
  acquisition_cost:    { required: false, type: 'number', positive: true },
  region:              { required: false, type: 'string' },
  status:              {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'In Shop', 'Retired']
  }
};

// Schema used for PUT /api/vehicles/:id
const updateVehicleSchema = {
  registration_number: { required: false, type: 'string' },
  name:                { required: false, type: 'string' },
  type:                { required: false, type: 'string' },
  max_load_capacity:   { required: false, type: 'number', positive: true },
  odometer:            { required: false, type: 'number', positive: true },
  acquisition_cost:    { required: false, type: 'number', positive: true },
  region:              { required: false, type: 'string' },
  status:              {
    required: false,
    type: 'enum',
    enum: ['Available', 'On Trip', 'In Shop', 'Retired']
  }
};

module.exports = {
  validateCreateVehicle: validate(createVehicleSchema),
  validateUpdateVehicle: validate(updateVehicleSchema)
};
