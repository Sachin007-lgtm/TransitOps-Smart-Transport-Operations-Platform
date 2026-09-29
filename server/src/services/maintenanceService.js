const Maintenance = require('../models/maintenanceModel');
const path = require('path');
const {
	getReceiptPath,
	deleteReceiptFile,
	hasExpectedFileSignature
} = require('./maintenanceReceiptStorage');

class MaintenanceServiceError extends Error {
	constructor(message, statusCode = 400) {
		super(message);
		this.statusCode = statusCode;
	}
}

function toPublicReport(report) {
	if (!report) return null;
	const { receipt_storage_key, ...publicReport } = report;
	return { ...publicReport, has_receipt: Boolean(receipt_storage_key) };
}

function sanitizeReceiptName(name, fallbackName) {
	return path.basename(String(name || fallbackName || 'repair-receipt'))
		.replace(/[\r\n]/g, '')
		.slice(0, 255);
}

const maintenanceService = {
	createDriverReport: async ({ trip_id, description, priority = 'Routine' }, user) => {
		const cleanedDescription = typeof description === 'string' ? description.trim() : '';
		if (cleanedDescription.length < 5 || cleanedDescription.length > 2000) {
			throw new MaintenanceServiceError('Describe the vehicle issue in 5 to 2000 characters.');
		}

		const trip = await Maintenance.findDriverReportContext(trip_id, user.organization_id, user.driver_id);
		if (!trip) {
			throw new MaintenanceServiceError('A maintenance report can only be submitted for your own dispatched trip.', 404);
		}

		return Maintenance.createDriverReport({
			organization_id: user.organization_id,
			trip_id,
			vehicle_id: trip.vehicle_id,
			driver_id: trip.driver_id,
			description: cleanedDescription,
			priority
		});
	},

	listReports: async (user, history = false) => Maintenance.findAllReports(user.organization_id, history),

	getDriverReportForTrip: async (trip_id, user) => {
		const report = await Maintenance.findDriverReportForTrip(trip_id, user.organization_id, user.driver_id);
		return toPublicReport(report);
	},

	updateReportStatus: async (id, { status, resolution_note }, user) => {
		if (user.role === 'Driver') {
			const current = await Maintenance.findActiveDriverReport(id, user.organization_id, user.driver_id);
			if (!current) throw new MaintenanceServiceError('Active maintenance report not found for this trip.', 404);
			const allowed = ['Open', 'Acknowledged'];
			if (!allowed.includes(status)) {
				throw new MaintenanceServiceError('Use the repair close-out step to record cost and receipt before marking the issue fixed.', 400);
			}
		}
		const updated = await Maintenance.updateReportStatus(id, user.organization_id, status, resolution_note);
		if (!updated) throw new MaintenanceServiceError('Maintenance report not found.', 404);
		return updated;
	},

	resolveDriverReport: async (id, { repair_cost, receipt_pending, receipt_original_name }, file, user) => {
		const current = await Maintenance.findActiveDriverReport(id, user.organization_id, user.driver_id);
		if (!current || current.status !== 'Acknowledged') {
			if (file) await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError("Mark the report as 'Fixing' before completing the repair.", 409);
		}

		const repairCost = Number(repair_cost);
		if (!Number.isFinite(repairCost) || repairCost < 0) {
			if (file) await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError('Enter a valid non-negative repair cost.');
		}

		const receiptPending = receipt_pending === true || receipt_pending === 'true';
		if (repairCost > 0 && !file && !receiptPending) {
			throw new MaintenanceServiceError('Upload the repair bill or mark its receipt as pending.');
		}
		if (file && receiptPending) {
			await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError('A receipt is uploaded; it cannot also be marked pending.');
		}

		if (file && !(await hasExpectedFileSignature(file.path, file.mimetype))) {
			await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError('The receipt file content does not match its declared type.');
		}

		const receipt = file ? {
			storageKey: file.filename,
			originalName: sanitizeReceiptName(receipt_original_name, file.originalname),
			mimeType: file.mimetype,
			sizeBytes: file.size
		} : null;

		try {
			const resolved = await Maintenance.resolveDriverReport({
				id,
				organization_id: user.organization_id,
				driver_id: user.driver_id,
				repair_cost: repairCost,
				receipt_pending: repairCost > 0 && receiptPending,
				receipt
			});
			if (!resolved) throw new MaintenanceServiceError('The report is no longer active on your dispatched trip.', 409);
			return toPublicReport(resolved);
		} catch (error) {
			if (file) await deleteReceiptFile(file.path);
			throw error;
		}
	},

	addPendingReceipt: async (id, { receipt_original_name }, file, user) => {
		const current = await Maintenance.findReportForDriver(id, user.organization_id, user.driver_id);
		if (!current || current.status !== 'Resolved' || !current.receipt_pending || current.receipt_storage_key) {
			if (file) await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError('This report is not waiting for a receipt.', 409);
		}
		if (!file || !(await hasExpectedFileSignature(file.path, file.mimetype))) {
			if (file) await deleteReceiptFile(file.path);
			throw new MaintenanceServiceError('Upload a valid PDF, JPEG, or PNG receipt.');
		}

		try {
			const updated = await Maintenance.addPendingReceipt({
				id,
				organization_id: user.organization_id,
				driver_id: user.driver_id,
				receipt: {
					storageKey: file.filename,
					originalName: sanitizeReceiptName(receipt_original_name, file.originalname),
					mimeType: file.mimetype,
					sizeBytes: file.size
				}
			});
			if (!updated) throw new MaintenanceServiceError('The receipt is no longer pending.', 409);
			return toPublicReport(updated);
		} catch (error) {
			await deleteReceiptFile(file.path);
			throw error;
		}
	},

	getReceiptForUser: async (id, user) => {
		const receipt = await Maintenance.findReceiptForUser(
			id,
			user.organization_id,
			user.role === 'Driver' ? user.driver_id : null
		);
		if (!receipt || !receipt.receipt_storage_key) {
			throw new MaintenanceServiceError('Receipt not found.', 404);
		}
		const filePath = getReceiptPath(receipt.receipt_storage_key);
		if (!filePath) throw new MaintenanceServiceError('Receipt not found.', 404);
		return { ...receipt, filePath };
	}
};

module.exports = { maintenanceService, MaintenanceServiceError };
