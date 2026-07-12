const validate = require('../middleware/validate');

const createMaintenanceSchema = {
  vehicle_id: { required: true, type: 'integer', positive: true },
  description: { required: true, type: 'string' },
  cost: { required: false, type: 'number', positive: true },
  start_date: { required: false, type: 'string' },
  status: { required: false, type: 'enum', enum: ['Active', 'Closed'] }
};

const updateMaintenanceSchema = {
  description: { required: false, type: 'string' },
  cost: { required: false, type: 'number', positive: true },
  start_date: { required: false, type: 'string' },
  end_date: { required: false, type: 'string' },
  status: { required: false, type: 'enum', enum: ['Active', 'Closed'] }
};

module.exports = {
  validateCreateMaintenance: validate(createMaintenanceSchema),
  validateUpdateMaintenance: validate(updateMaintenanceSchema)
};
