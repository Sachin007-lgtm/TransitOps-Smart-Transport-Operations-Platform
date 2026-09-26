const validate = require('../middleware/validate');
const {
  INDIAN_LICENSE_CATEGORIES,
  normalizeIndianLicenseNumber,
  normalizeLicenseCategory
} = require('../utils/license');

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
    custom: (val) => {
      if (!val || !val.trim()) return 'license_number is required.';
      const normalized = normalizeIndianLicenseNumber(val);
      if (!normalized) {
        return 'Invalid license number format. Must follow Indian driving license format: SS-RR-YYYY-NNNNNNN (e.g. MH-02-2020-0001234).';
      }
      return null;
    }
  },
  license_category: {
    required: false,
    type: 'string',
    custom: (val) => {
      if (val === null || val === undefined || val === '') return null; // Optional
      if (!normalizeLicenseCategory(val)) {
        return `license_category must be an official Indian category: ${INDIAN_LICENSE_CATEGORIES.join(', ')}`;
      }
      return null;
    }
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
  status: {
    required: false,
    type: 'enum',
    // 'On Trip' can NEVER be manually assigned upon driver creation
    enum: ['Available', 'Off Duty', 'Suspended']
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
    custom: (val) => {
      if (val === undefined) return null;
      if (!val || !val.trim()) return 'license_number cannot be empty.';
      const normalized = normalizeIndianLicenseNumber(val);
      if (!normalized) {
        return 'Invalid license number format. Must follow Indian driving license format: SS-RR-YYYY-NNNNNNN (e.g. MH-02-2020-0001234).';
      }
      return null;
    }
  },
  license_category: {
    required: false,
    type: 'string',
    custom: (val) => {
      if (val === null || val === undefined || val === '') return null; // Optional
      if (!normalizeLicenseCategory(val)) {
        return `license_category must be an official Indian category: ${INDIAN_LICENSE_CATEGORIES.join(', ')}`;
      }
      return null;
    }
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
  status: {
    required: false,
    type: 'enum',
    // 'On Trip' can NEVER be manually updated by manager
    enum: ['Available', 'Off Duty', 'Suspended']
  }
};

// Schema used for PATCH /api/drivers/:id/status
const updateDriverStatusSchema = {
  status: {
    required: true,
    type: 'enum',
    // 'On Trip' can NEVER be manually set; only automatically assigned by trip dispatcher
    enum: ['Available', 'Off Duty', 'Suspended']
  }
};

module.exports = {
  validateCreateDriver: validate(createDriverSchema),
  validateUpdateDriver: validate(updateDriverSchema),
  validateDriverStatus: validate(updateDriverStatusSchema),
  INDIAN_LICENSE_CATEGORIES
};
