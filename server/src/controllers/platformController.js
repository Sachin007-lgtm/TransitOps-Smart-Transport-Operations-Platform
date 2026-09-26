const { query, pool } = require('../config/db');
const User = require('../models/userModel');
const { generateTemporaryPassword, hashPassword } = require('../utils/credentials');
const { normalizePhoneNumber } = require('../utils/phone');
const asyncWrapper = require('../utils/asyncWrapper');
const apiResponse = require('../utils/apiResponse');

const createOrganization = asyncWrapper(async (req, res) => {
  const { name, slug, owner } = req.body || {};

  if (!name || !name.trim()) {
    return apiResponse.error(res, 'Organization name is required.', 400);
  }
  if (!owner || !owner.name || !owner.email) {
    return apiResponse.error(res, 'Initial Owner/Manager details (name and email) are required.', 400);
  }

  // Derive and guarantee unique organization slug
  const slugify = (text) => String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let baseSlug = (slug && slug.trim()) ? slugify(slug) : slugify(name);
  if (!baseSlug) baseSlug = 'org';

  let normalizedSlug = baseSlug;
  let counter = 1;
  while (true) {
    const existingOrg = await query('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', [normalizedSlug]);
    if (existingOrg.rows.length === 0) break;
    counter++;
    normalizedSlug = `${baseSlug}-${counter}`;
  }

  const normalizedEmail = owner.email.trim().toLowerCase();
  const normalizedPhone = owner.phone_number ? normalizePhoneNumber(owner.phone_number) : null;

  // Pre-check owner email uniqueness
  const existingUser = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [normalizedEmail]);
  if (existingUser.rows.length > 0) {
    return apiResponse.error(res, 'An account with this email address already exists.', 409);
  }

  const tempPassword = owner.password || generateTemporaryPassword();
  const passwordHash = await hashPassword(tempPassword);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create Organization
    const orgResult = await client.query(`
      INSERT INTO organizations (name, slug, status)
      VALUES ($1, $2, 'Active')
      RETURNING *
    `, [name.trim(), normalizedSlug]);
    const organization = orgResult.rows[0];

    // 2. Create Owner/Manager
    const createdOwner = await User.createOwnerManagerAccount({
      name: owner.name.trim(),
      email: normalizedEmail,
      phoneNumber: normalizedPhone,
      passwordHash,
      organizationId: organization.id,
      mustChangePassword: true
    }, client);

    await client.query('COMMIT');

    return apiResponse.success(res, {
      organization,
      owner: {
        id: createdOwner.id,
        name: createdOwner.name,
        email: createdOwner.email,
        phone_number: createdOwner.phone_number,
        role: 'Owner/Manager',
        organization_id: organization.id,
        must_change_password: true
      },
      temporary_password: tempPassword
    }, 'Organization and Owner/Manager provisioned successfully.', 201);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return apiResponse.error(res, 'Organization slug or owner email already exists.', 409);
    }
    console.error('Error provisioning organization:', error);
    return apiResponse.error(res, 'Failed to provision organization.', 500);
  } finally {
    client.release();
  }
});

const listOrganizations = asyncWrapper(async (req, res) => {
  const result = await query(`
    SELECT o.*,
           COUNT(DISTINCT v.id)::int AS vehicles_count,
           COUNT(DISTINCT d.id)::int AS drivers_count,
           COUNT(DISTINCT u.id)::int AS users_count,
           (SELECT u2.name FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_name,
           (SELECT u2.email FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_email,
           (SELECT u2.phone_number FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_phone,
           (SELECT u2.id FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_user_id,
           (SELECT u2.must_change_password FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_must_change_password
    FROM organizations o
    LEFT JOIN vehicles v ON v.organization_id = o.id
    LEFT JOIN drivers d ON d.organization_id = o.id
    LEFT JOIN users u ON u.organization_id = o.id
    GROUP BY o.id
    ORDER BY o.created_at DESC
  `);
  return apiResponse.success(res, result.rows, 'Organizations retrieved successfully.');
});

const getOrganizationById = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const result = await query(`
    SELECT o.*,
           COUNT(DISTINCT v.id)::int AS vehicles_count,
           COUNT(DISTINCT d.id)::int AS drivers_count,
           COUNT(DISTINCT u.id)::int AS users_count,
           (SELECT u2.name FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_name,
           (SELECT u2.email FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_email,
           (SELECT u2.phone_number FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_phone,
           (SELECT u2.id FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_user_id,
           (SELECT u2.must_change_password FROM users u2 JOIN roles r2 ON u2.role_id = r2.id WHERE u2.organization_id = o.id AND r2.name = 'Owner/Manager' LIMIT 1) AS owner_must_change_password
    FROM organizations o
    LEFT JOIN vehicles v ON v.organization_id = o.id
    LEFT JOIN drivers d ON d.organization_id = o.id
    LEFT JOIN users u ON u.organization_id = o.id
    WHERE o.id = $1
    GROUP BY o.id
  `, [id]);

  if (result.rows.length === 0) {
    return apiResponse.error(res, 'Organization not found.', 404);
  }
  return apiResponse.success(res, result.rows[0], 'Organization retrieved successfully.');
});

const updateOrganizationStatus = asyncWrapper(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  const allowed = ['Active', 'Suspended', 'Inactive'];
  if (!allowed.includes(status)) {
    return apiResponse.error(res, `Status must be one of: ${allowed.join(', ')}`, 400);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orgResult = await client.query(`
      UPDATE organizations SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 RETURNING *
    `, [status, id]);

    if (orgResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return apiResponse.error(res, 'Organization not found.', 404);
    }

    if (status === 'Suspended' || status === 'Inactive') {
      // Deactivate all users in this organization
      await client.query(`
        UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = $1
      `, [id]);
    } else if (status === 'Active') {
      // Reactivate Owner/Manager accounts in this organization
      await client.query(`
        UPDATE users u
        SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
        FROM roles r
        WHERE u.organization_id = $1 AND u.role_id = r.id AND r.name = 'Owner/Manager'
      `, [id]);
    }

    await client.query('COMMIT');
    return apiResponse.success(res, orgResult.rows[0], `Organization status updated to '${status}'.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating organization status:', error);
    return apiResponse.error(res, 'Failed to update organization status.', 500);
  } finally {
    client.release();
  }
});

const resetManagerPassword = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  // 1. Verify organization exists
  const orgResult = await query('SELECT id, name, status FROM organizations WHERE id = $1', [id]);
  if (orgResult.rows.length === 0) {
    return apiResponse.error(res, 'Organization not found.', 404);
  }
  const organization = orgResult.rows[0];

  // 2. Find Owner/Manager account for this organization
  const ownerResult = await query(`
    SELECT u.id, u.name, u.email, u.phone_number, u.is_active
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.organization_id = $1 AND r.name = 'Owner/Manager'
    ORDER BY u.created_at ASC
    LIMIT 1
  `, [id]);

  if (ownerResult.rows.length === 0) {
    return apiResponse.error(res, 'No Owner/Manager account found for this organization.', 404);
  }
  const owner = ownerResult.rows[0];

  // 3. Generate secure temporary password and hash with bcrypt (12 rounds)
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  // 4. Update owner credential with must_change_password = TRUE
  await query(`
    UPDATE users
    SET password_hash = $1,
        must_change_password = TRUE,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `, [passwordHash, owner.id]);

  return apiResponse.success(res, {
    organization: {
      id: organization.id,
      name: organization.name
    },
    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      phone_number: owner.phone_number
    },
    temporary_password: temporaryPassword
  }, `Temporary password generated for manager ${owner.email}. Revealed strictly once.`);
});

const getPlatformStats = asyncWrapper(async (req, res) => {
  const orgsRes = await query(`
    SELECT 
      COUNT(*)::int AS total_organizations,
      COUNT(CASE WHEN status = 'Active' THEN 1 END)::int AS active_organizations,
      COUNT(CASE WHEN status = 'Suspended' THEN 1 END)::int AS suspended_organizations
    FROM organizations
  `);
  const vehRes = await query(`SELECT COUNT(*)::int AS total_vehicles FROM vehicles`);
  const drvRes = await query(`SELECT COUNT(*)::int AS total_drivers FROM drivers`);
  const usrRes = await query(`SELECT COUNT(*)::int AS total_users FROM users`);

  const stats = {
    total_organizations: orgsRes.rows[0]?.total_organizations || 0,
    active_organizations: orgsRes.rows[0]?.active_organizations || 0,
    suspended_organizations: orgsRes.rows[0]?.suspended_organizations || 0,
    total_vehicles: vehRes.rows[0]?.total_vehicles || 0,
    total_drivers: drvRes.rows[0]?.total_drivers || 0,
    total_users: usrRes.rows[0]?.total_users || 0
  };

  return apiResponse.success(res, stats, 'Platform statistics retrieved successfully.');
});

module.exports = {
  createOrganization,
  listOrganizations,
  getOrganizationById,
  updateOrganizationStatus,
  resetManagerPassword,
  getPlatformStats
};
