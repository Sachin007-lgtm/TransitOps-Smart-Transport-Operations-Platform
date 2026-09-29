const { query } = require('../config/db');

const maintenanceModel = {
	createDriverReport: async ({ organization_id, trip_id, vehicle_id, driver_id, description, priority }) => {
		const result = await query(`
			INSERT INTO maintenance_reports
				(organization_id, trip_id, vehicle_id, driver_id, description, priority)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING *
		`, [organization_id, trip_id, vehicle_id, driver_id, description, priority]);
		return result.rows[0];
	},

	findDriverReportContext: async (trip_id, organization_id, driver_id) => {
		const result = await query(`
			SELECT id, vehicle_id, driver_id
			FROM trips
			WHERE id = $1 AND organization_id = $2 AND driver_id = $3 AND status = 'Dispatched'
		`, [trip_id, organization_id, driver_id]);
		return result.rows[0] || null;
	},

	findDriverReportForTrip: async (trip_id, organization_id, driver_id) => {
		const result = await query(`
			SELECT mr.*
			FROM maintenance_reports mr
			JOIN trips t ON t.id = mr.trip_id AND t.organization_id = mr.organization_id
			WHERE mr.trip_id = $1 AND mr.organization_id = $2 AND mr.driver_id = $3
			ORDER BY mr.created_at DESC
			LIMIT 1
		`, [trip_id, organization_id, driver_id]);
		return result.rows[0] || null;
	},

	findActiveDriverReport: async (id, organization_id, driver_id) => {
		const result = await query(`
			SELECT mr.*
			FROM maintenance_reports mr
			JOIN trips t ON t.id = mr.trip_id AND t.organization_id = mr.organization_id
			WHERE mr.id = $1 AND mr.organization_id = $2 AND mr.driver_id = $3
				AND mr.status <> 'Resolved' AND t.status = 'Dispatched'
		`, [id, organization_id, driver_id]);
		return result.rows[0] || null;
	},

	findAllReports: async (organization_id, history = false) => {
		const result = await query(`
			SELECT mr.id, mr.organization_id, mr.trip_id, mr.vehicle_id, mr.driver_id,
					mr.description, mr.priority, mr.status, mr.repair_cost, mr.receipt_pending,
					mr.receipt_file_name, mr.receipt_mime_type, mr.receipt_size_bytes,
					mr.resolution_note, mr.resolved_at, mr.created_at, mr.updated_at,
					(mr.receipt_storage_key IS NOT NULL) AS has_receipt,
					v.registration_number AS vehicle_registration,
						 v.name AS vehicle_name, d.name AS driver_name,
						 t.origin, t.destination
			FROM maintenance_reports mr
			JOIN vehicles v ON v.id = mr.vehicle_id AND v.organization_id = mr.organization_id
			JOIN drivers d ON d.id = mr.driver_id AND d.organization_id = mr.organization_id
			JOIN trips t ON t.id = mr.trip_id AND t.organization_id = mr.organization_id
			WHERE mr.organization_id = $1
				AND (($2::boolean AND mr.status = 'Resolved') OR (NOT $2::boolean AND mr.status <> 'Resolved'))
			ORDER BY CASE mr.status WHEN 'Open' THEN 0 WHEN 'Acknowledged' THEN 1 ELSE 2 END,
							 COALESCE(mr.resolved_at, mr.created_at) DESC
		`, [organization_id, history]);
		return result.rows;
	},

	findReportForDriver: async (id, organization_id, driver_id) => {
		const result = await query(`
			SELECT mr.*, t.status AS trip_status
			FROM maintenance_reports mr
			JOIN trips t ON t.id = mr.trip_id AND t.organization_id = mr.organization_id
			WHERE mr.id = $1 AND mr.organization_id = $2 AND mr.driver_id = $3
		`, [id, organization_id, driver_id]);
		return result.rows[0] || null;
	},

	resolveDriverReport: async ({ id, organization_id, driver_id, repair_cost, receipt_pending, receipt }) => {
		const result = await query(`
			UPDATE maintenance_reports mr
			SET status = 'Resolved',
				repair_cost = $4,
				receipt_pending = $5,
				receipt_storage_key = $6,
				receipt_file_name = $7,
				receipt_mime_type = $8,
				receipt_size_bytes = $9,
				resolved_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			FROM trips t
			WHERE mr.id = $1 AND mr.organization_id = $2 AND mr.driver_id = $3
				AND mr.trip_id = t.id AND mr.organization_id = t.organization_id
				AND mr.status = 'Acknowledged' AND t.status = 'Dispatched' AND t.driver_id = $3
			RETURNING mr.*
		`, [
			id,
			organization_id,
			driver_id,
			repair_cost,
			receipt_pending,
			receipt?.storageKey || null,
			receipt?.originalName || null,
			receipt?.mimeType || null,
			receipt?.sizeBytes || null
		]);
		const updated = result.rows[0] || null;
		if (updated) await maintenanceModel.releaseVehicleIfNoOpenReports(updated.vehicle_id, organization_id);
		return updated;
	},

	addPendingReceipt: async ({ id, organization_id, driver_id, receipt }) => {
		const result = await query(`
			UPDATE maintenance_reports
			SET receipt_storage_key = $4,
				receipt_file_name = $5,
				receipt_mime_type = $6,
				receipt_size_bytes = $7,
				receipt_pending = FALSE,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $1 AND organization_id = $2 AND driver_id = $3
				AND status = 'Resolved' AND receipt_pending = TRUE AND receipt_storage_key IS NULL
			RETURNING *
		`, [id, organization_id, driver_id, receipt.storageKey, receipt.originalName, receipt.mimeType, receipt.sizeBytes]);
		return result.rows[0] || null;
	},

	findReceiptForUser: async (id, organization_id, driver_id = null) => {
		const result = await query(`
			SELECT id, receipt_storage_key, receipt_file_name, receipt_mime_type
			FROM maintenance_reports
			WHERE id = $1 AND organization_id = $2
				AND ($3::uuid IS NULL OR driver_id = $3)
		`, [id, organization_id, driver_id]);
		return result.rows[0] || null;
	},

	releaseVehicleIfNoOpenReports: async (vehicle_id, organization_id) => {
		await query(`
			UPDATE vehicles
			SET status = 'Available', updated_at = CURRENT_TIMESTAMP
			WHERE id = $1 AND organization_id = $2 AND status = 'In Shop'
				AND NOT EXISTS (
					SELECT 1 FROM maintenance_reports
					WHERE vehicle_id = $1 AND organization_id = $2 AND status <> 'Resolved'
				)
		`, [vehicle_id, organization_id]);
	},

	updateReportStatus: async (id, organization_id, status, resolution_note) => {
		const result = await query(`
			UPDATE maintenance_reports
			SET status = $3::varchar,
					resolution_note = CASE WHEN $4::text IS NULL THEN resolution_note ELSE $4::text END,
					resolved_at = CASE WHEN $3::varchar = 'Resolved' THEN CURRENT_TIMESTAMP ELSE NULL END,
					updated_at = CURRENT_TIMESTAMP
			WHERE id = $1 AND organization_id = $2
			RETURNING *
		`, [id, organization_id, status, resolution_note || null]);
		const updated = result.rows[0] || null;
		if (updated && status === 'Resolved') {
			await maintenanceModel.releaseVehicleIfNoOpenReports(updated.vehicle_id, organization_id);
		}
		return updated;
	}
};

module.exports = maintenanceModel;
