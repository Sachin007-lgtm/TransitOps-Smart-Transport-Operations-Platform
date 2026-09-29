const { maintenanceService, MaintenanceServiceError } = require('../services/maintenanceService');
const fs = require('fs');
const path = require('path');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const handleError = (res, err) => {
	if (err instanceof MaintenanceServiceError) {
		return apiResponse.error(res, err.message, err.statusCode);
	}
	console.error('Unexpected Maintenance Error:', err);
	return apiResponse.error(res, err.message || 'Internal server error.', 500);
};

const createDriverReport = asyncWrapper(async (req, res) => {
	try {
		const report = await maintenanceService.createDriverReport(req.body, req.user);
		return apiResponse.success(res, report, 'Maintenance report submitted.', 201);
	} catch (err) {
		return handleError(res, err);
	}
});

const listReports = asyncWrapper(async (req, res) => {
	try {
		const history = req.query.view === 'history';
		return apiResponse.success(res, await maintenanceService.listReports(req.user, history));
	} catch (err) {
		return handleError(res, err);
	}
});

const resolveDriverReport = asyncWrapper(async (req, res) => {
	try {
		const report = await maintenanceService.resolveDriverReport(req.params.id, req.body, req.file, req.user);
		return apiResponse.success(res, report, 'Repair recorded and report marked fixed.');
	} catch (err) {
		return handleError(res, err);
	}
});

const uploadPendingReceipt = asyncWrapper(async (req, res) => {
	try {
		const report = await maintenanceService.addPendingReceipt(req.params.id, req.body, req.file, req.user);
		return apiResponse.success(res, report, 'Pending receipt uploaded.');
	} catch (err) {
		return handleError(res, err);
	}
});

const downloadReceipt = asyncWrapper(async (req, res) => {
	try {
		const receipt = await maintenanceService.getReceiptForUser(req.params.id, req.user);
		try {
			await fs.promises.access(receipt.filePath, fs.constants.R_OK);
		} catch {
			throw new MaintenanceServiceError('Receipt file is unavailable.', 404);
		}
		res.setHeader('Cache-Control', 'private, no-store');
		res.setHeader('X-Content-Type-Options', 'nosniff');
		res.type(receipt.receipt_mime_type || 'application/octet-stream');
		const downloadName = path.basename(receipt.receipt_file_name || 'repair-receipt').replace(/[\r\n]/g, '');
		return res.download(receipt.filePath, downloadName, error => {
			if (error && !res.headersSent) handleError(res, error);
		});
	} catch (err) {
		return handleError(res, err);
	}
});

const getDriverReportForTrip = asyncWrapper(async (req, res) => {
	try {
		const report = await maintenanceService.getDriverReportForTrip(req.params.tripId, req.user);
		return apiResponse.success(res, report);
	} catch (err) {
		return handleError(res, err);
	}
});

const updateReportStatus = asyncWrapper(async (req, res) => {
	try {
		const report = await maintenanceService.updateReportStatus(req.params.id, req.body, req.user);
		return apiResponse.success(res, report, 'Maintenance report updated.');
	} catch (err) {
		return handleError(res, err);
	}
});

module.exports = {
	createDriverReport,
	listReports,
	getDriverReportForTrip,
	updateReportStatus,
	resolveDriverReport,
	uploadPendingReceipt,
	downloadReceipt
};
