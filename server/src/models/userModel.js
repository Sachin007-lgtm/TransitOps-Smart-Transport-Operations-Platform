const { query } = require('../config/db');

const publicUserColumns = `
	u.id, u.name, u.email, u.phone_number, u.role_id,
	r.name AS role, u.organization_id, u.driver_id,
	u.must_change_password, u.is_active, u.created_at, u.updated_at
`;

const User = {
	findByLogin: async (identifier) => {
		const trimmed = String(identifier || '').trim();
		const result = await query(`
			SELECT u.*, r.name AS role
			FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE u.phone_number = $1 OR LOWER(u.email) = LOWER($1)
			LIMIT 1
		`, [trimmed]);
		return result.rows[0];
	},

	findById: async (id) => {
		const result = await query(`
			SELECT ${publicUserColumns}
			FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE u.id = $1
		`, [id]);
		return result.rows[0];
	},

	findByIdWithPassword: async (id) => {
		const result = await query(`
			SELECT u.*, r.name AS role
			FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE u.id = $1 AND u.is_active = TRUE
		`, [id]);
		return result.rows[0];
	},

	findDriverAccount: async (driverId, organizationId, client = { query }) => {
		const result = await client.query(`
			SELECT u.*, r.name AS role
			FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE u.driver_id = $1 AND u.organization_id = $2
			LIMIT 1
		`, [driverId, organizationId]);
		return result.rows[0];
	},

	createDriverAccount: async ({ name, phoneNumber, passwordHash, organizationId, driverId }, client = { query }) => {
		const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'Driver' LIMIT 1`);
		if (!roleResult.rows[0]) throw new Error('Driver role is not configured.');

		const result = await client.query(`
			INSERT INTO users (
				name, phone_number, password_hash, role_id, organization_id,
				driver_id, must_change_password, is_active
			)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE, TRUE)
			RETURNING id, name, phone_number, role_id, organization_id, driver_id, must_change_password, is_active
		`, [name.trim(), phoneNumber, passwordHash, roleResult.rows[0].id, organizationId, driverId]);
		return result.rows[0];
	},

	createOwnerManagerAccount: async ({ name, email, phoneNumber, passwordHash, organizationId, mustChangePassword = false }, client = { query }) => {
		const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'Owner/Manager' LIMIT 1`);
		if (!roleResult.rows[0]) throw new Error('Owner/Manager role is not configured.');

		const normalizedEmail = email ? email.trim().toLowerCase() : null;
		const result = await client.query(`
			INSERT INTO users (
				name, email, phone_number, password_hash, role_id, organization_id,
				driver_id, must_change_password, is_active
			)
			VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, TRUE)
			RETURNING id, name, email, phone_number, role_id, organization_id, driver_id, must_change_password, is_active
		`, [name.trim(), normalizedEmail, phoneNumber || null, passwordHash, roleResult.rows[0].id, organizationId, mustChangePassword]);
		return result.rows[0];
	},

	createPlatformAdminAccount: async ({ name, email, phoneNumber, passwordHash }, client = { query }) => {
		const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'Platform Admin' LIMIT 1`);
		if (!roleResult.rows[0]) throw new Error('Platform Admin role is not configured.');

		const normalizedEmail = email.trim().toLowerCase();
		const result = await client.query(`
			INSERT INTO users (
				name, email, phone_number, password_hash, role_id, organization_id,
				driver_id, must_change_password, is_active
			)
			VALUES ($1, $2, $3, $4, $5, NULL, NULL, FALSE, TRUE)
			RETURNING id, name, email, phone_number, role_id, organization_id, driver_id, must_change_password, is_active
		`, [name.trim(), normalizedEmail, phoneNumber || null, passwordHash, roleResult.rows[0].id]);
		return result.rows[0];
	},

	updatePassword: async (id, passwordHash, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET password_hash = $1,
					must_change_password = FALSE,
					updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
			RETURNING id
		`, [passwordHash, id]);
		return result.rows[0];
	},

	resetTemporaryPassword: async (id, passwordHash, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET password_hash = $1,
				must_change_password = TRUE,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $2 AND is_active = TRUE
			RETURNING id
		`, [passwordHash, id]);
		return result.rows[0];
	},

	deactivateDriverAccount: async (driverId, organizationId, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET is_active = FALSE,
				updated_at = CURRENT_TIMESTAMP
			WHERE driver_id = $1 AND organization_id = $2
			RETURNING id
		`, [driverId, organizationId]);
		return result.rows[0];
	},

	activateDriverAccount: async (driverId, organizationId, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET is_active = TRUE,
				updated_at = CURRENT_TIMESTAMP
			WHERE driver_id = $1 AND organization_id = $2
			RETURNING id
		`, [driverId, organizationId]);
		return result.rows[0];
	}
};

module.exports = User;
