const validate = require('../middleware/validate');
const { normalizeIndianNumberPlate } = require('../utils/numberPlate');

// Schema for POST /api/vehicles
const createVehicleSchema = {
  registration_number: {
    required: false,
    type: 'string',
    custom: (val, req) => {
      const rawPlate = val || req.body?.numberPlate || req.body?.number_plate;
      if (!rawPlate || !String(rawPlate).trim()) {
        return 'Number plate is required.';
      }
      const normalized = normalizeIndianNumberPlate(String(rawPlate));
      if (!normalized) {
        return 'Invalid number plate format. Must follow Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234).';
      }
      return null;
    }
  },
  type: {
    required: false,
    type: 'string',
    custom: (val, req) => {
      const resolved = val || req.body?.customType;
      if (!resolved || !String(resolved).trim()) {
        return 'Vehicle type is required.';
      }
      return null;
    }
  },
  size: {
    required: false,
    type: 'string'
  },
  sub_category: {
    required: false,
    type: 'string'
  },
  distance_covered: {
    required: false,
    type: 'number',
    custom: (val) => {
      if (val !== undefined && val !== null && val < 0) {
        return 'Distance covered must be 0 or a positive number.';
      }
      return null;
    }
  },
  odometer: {
    required: false,
    type: 'number',
    custom: (val) => {
      if (val !== undefined && val !== null && val < 0) {
        return 'Odometer must be 0 or a positive number.';
      }
      return null;
    }
  }
};

// Schema for PUT/PATCH /api/vehicles/:id
const updateVehicleSchema = {
  registration_number: {
    required: false,
    type: 'string',
    custom: (val, req) => {
      const rawPlate = val || req.body?.numberPlate || req.body?.number_plate;
      if (rawPlate !== undefined) {
        if (!String(rawPlate).trim()) return 'Number plate cannot be empty.';
        const normalized = normalizeIndianNumberPlate(String(rawPlate));
        if (!normalized) {
          return 'Invalid number plate format. Must follow Indian format: SS-RR-XX-NNNN (e.g. MH-01-AB-1234).';
        }
      }
      return null;
    }
  },
  status: {
    required: false,
    type: 'string',
    custom: (val) => {
      if (val !== undefined) {
        if (val === 'On Trip' || val === 'On trip') {
          return 'Vehicle status cannot be manually set to "On Trip". "On Trip" status is managed automatically by trip dispatch.';
        }
        const allowed = ['Available', 'In Shop', 'In shop', 'Maintenance', 'Retired'];
        if (!allowed.includes(val)) {
          return `Invalid status '${val}'. Allowed: Available, Maintenance, Retired.`;
        }
      }
      return null;
    }
  }
};

module.exports = {
  validateCreateVehicle: validate(createVehicleSchema),
  validateUpdateVehicle: validate(updateVehicleSchema)
};
