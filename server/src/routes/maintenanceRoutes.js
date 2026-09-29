const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const requireTenantContext = require('../middleware/requireTenantContext');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
	createDriverReport,
	listReports,
	getDriverReportForTrip,
	updateReportStatus,
	resolveDriverReport,
	uploadPendingReceipt,
	downloadReceipt
} = require('../controllers/maintenanceController');
const { uploadMaintenanceReceipt } = require('../services/maintenanceReceiptStorage');

router.use(authenticate, requireTenantContext);

router.post('/driver-reports', authorize(['Driver']), validate({
	trip_id: { required: true, type: 'uuid' },
	description: { required: true, type: 'string' },
	priority: { required: false, type: 'enum', enum: ['Routine', 'Urgent', 'Critical'] }
}), createDriverReport);

router.get('/driver-reports', authorize(['Owner/Manager']), listReports);

router.get('/driver-reports/trip/:tripId', authorize(['Driver']), getDriverReportForTrip);

router.post('/driver-reports/:id/fix', authorize(['Driver']), uploadMaintenanceReceipt, resolveDriverReport);

router.post('/driver-reports/:id/receipt', authorize(['Driver']), uploadMaintenanceReceipt, uploadPendingReceipt);

router.get('/driver-reports/:id/receipt', authorize(['Owner/Manager', 'Driver']), downloadReceipt);

router.patch('/driver-reports/:id', authorize(['Owner/Manager', 'Driver']), validate({
	status: { required: true, type: 'enum', enum: ['Open', 'Acknowledged', 'Resolved'] },
	resolution_note: { required: false, type: 'string' }
}), updateReportStatus);

module.exports = router;
