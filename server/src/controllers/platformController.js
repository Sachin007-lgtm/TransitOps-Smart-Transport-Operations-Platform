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
  if (!slug || !slug.trim()) {
    return apiResponse.error(res, 'Organization slug is required.', 400);
  }
  if (!owner || !owner.name || !owner.email) {
    return apiResponse.error(res, 'Initial Owner/Manager details (name and email) are required.', 400);
  }

  const normalizedSlug = slug.trim().toLowerCase();
  const normalizedEmail = owner.email.trim().toLowerCase();
  const normalizedPhone = owner.phone_number ? normalizePhoneNumber(owner.phone_number) : null;

  // Pre-check slug uniqueness
  const existingOrg = await query('SELECT id FROM organizations WHERE slug = $1 LIMIT 1', [normalizedSlug]);
  if (existingOrg.rows.length > 0) {
    return apiResponse.error(res, `Organization slug '${normalizedSlug}' is already taken.`, 409);
  }

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
           COUNT(DISTINCT u.id)::int AS users_count
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
           COUNT(DISTINCT u.id)::int AS users_count
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

module.exports = {
  createOrganization,
  listOrganizations,
  getOrganizationById,
  updateOrganizationStatus
};
