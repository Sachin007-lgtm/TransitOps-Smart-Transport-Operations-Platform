const express = require('express');
const router = express.Router();
const {
  createCompany,
  getAllCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
  getAllBills,
  getBillById,
  getBillDownload,
  generateBill,
  recordPayment,
  deleteBill,
  getUnbilledTrips,
  assignTripToCompany
} = require('../controllers/billingController');
const {
  validateCreateCompany,
  validateUpdateCompany,
  validateGenerateBill,
  validateRecordPayment
} = require('../validators/billingValidator');

// Companies
router.route('/companies')
  .post(validateCreateCompany, createCompany)
  .get(getAllCompanies);

router.route('/companies/:id')
  .get(getCompanyById)
  .put(validateUpdateCompany, updateCompany)
  .delete(deleteCompany);

// Bills
router.route('/bills')
  .get(getAllBills)
  .post(validateGenerateBill, generateBill);

router.route('/bills/:id')
  .get(getBillById)
  .delete(deleteBill);

router.route('/bills/:id/download')
  .get(getBillDownload);

router.route('/bills/:id/payments')
  .post(validateRecordPayment, recordPayment);

// Trip-to-company assignment (completed trips become billable work)
router.route('/companies/:companyId/trips')
  .get(getUnbilledTrips);

router.route('/trips/:tripId/assign-company')
  .put(assignTripToCompany);

module.exports = router;
