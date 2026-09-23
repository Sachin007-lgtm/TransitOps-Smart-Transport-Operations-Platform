const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getUnbilledTrips,
  getAllBills,
  getBillById,
  generateBill,
  recordPayment,
  deleteBill,
  getBillDownload
} = require('../controllers/billingController');
const {
  validateCreateCompany,
  validateUpdateCompany,
  validateGenerateBill,
  validateRecordPayment
} = require('../validators/billingValidator');

// All billing endpoints require a valid JWT (via authenticate) and are scoped
// to the caller's organization inside the service layer.
router.use(authenticate);

// Everyone who runs or books transport work can read billing;
// only Fleet Manager and Financial Analyst may change money.
const READ_ROLES = ['Fleet Manager', 'Financial Analyst', 'Dispatcher'];
const WRITE_ROLES = ['Fleet Manager', 'Financial Analyst'];

// --- Companies (the customers trips are billed to) ---
router.route('/companies')
  .post(authorize(WRITE_ROLES), validateCreateCompany, createCompany)
  .get(authorize(READ_ROLES), getAllCompanies);

router.route('/companies/:id')
  .get(authorize(READ_ROLES), getCompanyById)
  .put(authorize(WRITE_ROLES), validateUpdateCompany, updateCompany)
  .delete(authorize(WRITE_ROLES), deleteCompany);

// Unbilled trips for a company — the pool a bill is composed from.
// ?statuses=Completed,Dispatched widens it beyond the default.
router.route('/companies/:companyId/unbilled')
  .get(authorize(READ_ROLES), getUnbilledTrips);

// --- Bills ---
router.route('/bills')
  .get(authorize(READ_ROLES), getAllBills)
  .post(authorize(WRITE_ROLES), validateGenerateBill, generateBill);

router.route('/bills/:id')
  .get(authorize(READ_ROLES), getBillById)
  .delete(authorize(WRITE_ROLES), deleteBill);

router.route('/bills/:id/download')
  .get(authorize(READ_ROLES), getBillDownload);

router.route('/bills/:id/payments')
  .post(authorize(WRITE_ROLES), validateRecordPayment, recordPayment);

module.exports = router;
