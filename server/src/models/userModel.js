const { query } = require('../config/db');

const publicUserColumns = `
	u.id, u.name, u.email, u.phone_number, u.role_id,
	r.name AS role, u.organization_id, u.driver_id,
	u.must_change_password
`;

const User = {
	findByLogin: async (identifier) => {
		const result = await query(`
			SELECT u.*, r.name AS role
			FROM users u
			JOIN roles r ON r.id = u.role_id
			WHERE u.phone_number = $1 OR u.email = $1
			LIMIT 1
		`, [identifier]);
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
			SELECT * FROM users
			WHERE driver_id = $1 AND organization_id = $2
			LIMIT 1
		`, [driverId, organizationId]);
		return result.rows[0];
	},

	createDriverAccount: async ({ name, phoneNumber, passwordHash, temporaryPasswordEncrypted, organizationId, driverId }, client = { query }) => {
		const roleResult = await client.query(`SELECT id FROM roles WHERE name = 'Driver' LIMIT 1`);
		if (!roleResult.rows[0]) throw new Error('Driver role is not configured.');

		const result = await client.query(`
			INSERT INTO users (
				name, phone_number, password_hash, role_id, organization_id,
				driver_id, must_change_password, temporary_password_encrypted
			)
			VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
			RETURNING id, name, phone_number, role_id, organization_id, driver_id, must_change_password
		`, [name, phoneNumber, passwordHash, roleResult.rows[0].id, organizationId, driverId, temporaryPasswordEncrypted]);
		return result.rows[0];
	},

	updatePassword: async (id, passwordHash, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET password_hash = $1,
					must_change_password = FALSE,
					temporary_password_encrypted = NULL,
					updated_at = CURRENT_TIMESTAMP
			WHERE id = $2
			RETURNING id
		`, [passwordHash, id]);
		return result.rows[0];
	},

	resetTemporaryPassword: async (id, passwordHash, encryptedPassword, client = { query }) => {
		const result = await client.query(`
			UPDATE users
			SET password_hash = $1,
				must_change_password = TRUE,
				temporary_password_encrypted = $2,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $3 AND driver_id IS NOT NULL AND is_active = TRUE
			RETURNING id
		`, [passwordHash, encryptedPassword, id]);
		return result.rows[0];
	},

	clearTemporaryPassword: async (id, client = { query }) => {
		await client.query(`
			UPDATE users
			SET temporary_password_encrypted = NULL,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $1
		`, [id]);
	},

	listDriverAccountsWithoutCredentials: async (client = { query }) => {
		const result = await client.query(`
			SELECT d.id AS driver_id, d.name, d.contact_number, d.organization_id
			FROM drivers d
			LEFT JOIN users u ON u.driver_id = d.id
			WHERE u.id IS NULL
		`);
		return result.rows;
	}
};

module.exports = User;
