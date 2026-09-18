const validate = require('../middleware/validate');

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
  company_id: { required: true, type: 'integer', positive: true },
  note: { required: false, type: 'string' }
};

const recordPaymentSchema = {
  amount: { required: true, type: 'number', positive: true },
  mode: { required: true, type: 'enum', enum: ['Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other'] },
  payment_date: { required: false, type: 'string' },
  note: { required: false, type: 'string' }
};

module.exports = {
  validateCreateCompany: validate(createCompanySchema),
  validateUpdateCompany: validate(updateCompanySchema),
  validateGenerateBill: validate(generateBillSchema),
  validateRecordPayment: validate(recordPaymentSchema)
};
