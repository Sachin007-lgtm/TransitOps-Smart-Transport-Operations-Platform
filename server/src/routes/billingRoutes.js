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
  getStatement,
  issueStatement,
  createCharge,
  getAllCharges,
  updateCharge,
  deleteCharge,
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
const {
  validateCreateCharge,
  validateUpdateCharge
} = require('../validators/chargeValidator');

// All billing endpoints require a valid JWT (via authenticate) and are scoped
// to the caller's organization inside the service layer.
router.use(authenticate);

// Everyone who runs or books transport work can read billing;
// only Fleet Manager and Financial Analyst may change money.
// dev's role set is exactly Platform Admin / Owner/Manager / Driver: billing is
// the owner/manager's job, and a driver has no access to customer money either
// way.
const READ_ROLES = ['Owner/Manager'];
const WRITE_ROLES = ['Owner/Manager'];

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

// The customer's OPEN STATEMENT: pending trips + charges + the ledger
// (previous balance -> this period -> closing), and the one action that turns
// it into a numbered document.
router.route('/companies/:companyId/statement')
  .get(authorize(READ_ROLES), getStatement);

// The issue route carries the customer in the path; the validator it shares
// with POST /bills expects it in the body.
const companyFromParams = (req, res, next) => {
  const fromPath = req.params.companyId;
  if (fromPath && (req.body.company_id === undefined || req.body.company_id === null || req.body.company_id === '')) {
    // A UUID, never Number(): casting would turn it into NaN and the validator
    // would reject a perfectly good path.
    req.body.company_id = fromPath;
  }
  next();
};

router.route('/companies/:companyId/statement/issue')
  .post(authorize(WRITE_ROLES), companyFromParams, validateGenerateBill, issueStatement);

// Charges that ride on a statement: tolls, loading/unloading, detention,
// driver allowance, misc.
router.route('/companies/:companyId/charges')
  .post(authorize(WRITE_ROLES), validateCreateCharge, createCharge);

router.route('/charges')
  .get(authorize(READ_ROLES), getAllCharges);

router.route('/charges/:id')
  .patch(authorize(WRITE_ROLES), validateUpdateCharge, updateCharge)
  .put(authorize(WRITE_ROLES), validateUpdateCharge, updateCharge)
  .delete(authorize(WRITE_ROLES), deleteCharge);

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
