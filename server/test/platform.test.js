const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { hashPassword } = require('../src/utils/credentials');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload, options = { expiresIn: '1h' }) {
  return jwt.sign(payload, JWT_SECRET, options);
}

describe('Platform Admin Module Backend Tests', () => {
  let server;
  let platformBaseUrl;
  let adminToken;
  let managerToken;
  let driverToken;

  const testOrgId = 'f0000000-0000-0000-0000-000000000001';
  let createdOrgId;
  let testAdminUserId;
  let testManagerUserId;

  before(async () => {
    await new Promise((resolve) => {
      server = app.listen(0, resolve);
    });
    const port = server.address().port;
    platformBaseUrl = `http://127.0.0.1:${port}/api/platform`;

    // 1. Roles
    const rolesRes = await query("SELECT id, name FROM roles WHERE name IN ('Platform Admin', 'Owner/Manager', 'Driver')");
    const adminRoleId = rolesRes.rows.find(r => r.name === 'Platform Admin')?.id;
    const managerRoleId = rolesRes.rows.find(r => r.name === 'Owner/Manager')?.id;
    const driverRoleId = rolesRes.rows.find(r => r.name === 'Driver')?.id;

    // 2. Clean previous artifacts if any
    await query("DELETE FROM users WHERE email IN ('superadmin_test@transitops.com', 'mgr_test@platformtest.com')");
    await query("DELETE FROM organizations WHERE id = $1", [testOrgId]);

    // 3. Ensure test organization exists
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Platform Test Org', 'platform-test-org', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [testOrgId]);

    // 3. Create test Platform Admin user in DB
    const pwdHash = await hashPassword('AdminPass123!');
    const adminRes = await query(`
      INSERT INTO users (name, email, password_hash, role_id, organization_id, is_active, must_change_password)
      VALUES ('Super Admin', 'superadmin_test@transitops.com', $1, $2, NULL, TRUE, FALSE)
      RETURNING id
    `, [pwdHash, adminRoleId]);
    testAdminUserId = adminRes.rows[0].id;

    // 4. Create test Manager user in DB
    const mgrRes = await query(`
      INSERT INTO users (name, email, password_hash, role_id, organization_id, is_active, must_change_password)
      VALUES ('Test Manager', 'mgr_test@platformtest.com', $1, $2, $3, TRUE, FALSE)
      RETURNING id
    `, [pwdHash, managerRoleId, testOrgId]);
    testManagerUserId = mgrRes.rows[0].id;

    // 5. Mint tokens
    adminToken = createToken({
      id: testAdminUserId,
      email: 'superadmin_test@transitops.com',
      role: 'Platform Admin',
      organization_id: null,
      driver_id: null
    });

    managerToken = createToken({
      id: testManagerUserId,
      email: 'mgr_test@platformtest.com',
      role: 'Owner/Manager',
      organization_id: testOrgId
    });

    driverToken = createToken({
      id: 'd0000000-0000-0000-0000-000000000001',
      phone_number: '+919876543210',
      role: 'Driver',
      organization_id: testOrgId
    });
  });

  after(async () => {
    if (createdOrgId) {
      await query('DELETE FROM users WHERE organization_id = $1', [createdOrgId]);
      await query('DELETE FROM organizations WHERE id = $1', [createdOrgId]);
    }
    await query('DELETE FROM users WHERE id IN ($1, $2)', [testAdminUserId, testManagerUserId]);
    await query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('1. Reject unauthenticated access to platform endpoints with 401', async () => {
    const res = await fetch(`${platformBaseUrl}/stats`);
    assert.equal(res.status, 401);
  });

  test('2. Reject Owner/Manager access to platform endpoints with 403', async () => {
    const res = await fetch(`${platformBaseUrl}/stats`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /restricted to Platform Administrators/i);
  });

  test('3. Reject Driver access to platform endpoints with 403', async () => {
    const res = await fetch(`${platformBaseUrl}/stats`, {
      headers: { Authorization: `Bearer ${driverToken}` }
    });
    assert.equal(res.status, 403);
  });

  test('4. Platform Admin can fetch platform stats (KPIs)', async () => {
    const res = await fetch(`${platformBaseUrl}/stats`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(typeof body.data.total_organizations === 'number');
    assert.ok(typeof body.data.active_organizations === 'number');
    assert.ok(typeof body.data.total_vehicles === 'number');
    assert.ok(typeof body.data.total_drivers === 'number');
    assert.ok(typeof body.data.total_users === 'number');
  });

  test('5. Platform Admin can list organizations with asset counts and owner metadata', async () => {
    const res = await fetch(`${platformBaseUrl}/organizations`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));

    const testOrg = body.data.find(o => o.id === testOrgId);
    assert.ok(testOrg);
    assert.equal(testOrg.name, 'Platform Test Org');
    assert.equal(testOrg.owner_name, 'Test Manager');
    assert.equal(testOrg.owner_email, 'mgr_test@platformtest.com');
    assert.equal(typeof testOrg.vehicles_count, 'number');
    assert.equal(typeof testOrg.drivers_count, 'number');
    assert.equal(typeof testOrg.users_count, 'number');
  });

  test('6. Platform Admin can onboard a new organization with initial Owner/Manager', async () => {
    const payload = {
      name: 'Sahyadri Freight Express',
      slug: `sahyadri-express-${Date.now()}`,
      owner: {
        name: 'Ganesh Shinde',
        email: `ganesh_${Date.now()}@sahyadrifreight.in`,
        phone_number: '+919922334455'
      }
    };

    const res = await fetch(`${platformBaseUrl}/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.organization?.id);
    assert.equal(body.data.organization.name, payload.name);
    assert.equal(body.data.owner.email, payload.owner.email);
    assert.ok(body.data.temporary_password, 'Must return temporary password for manager');
    assert.equal(typeof body.data.temporary_password, 'string');

    createdOrgId = body.data.organization.id;
  });

  test('7. Platform Admin can suspend an organization and verify user lockout', async () => {
    const res = await fetch(`${platformBaseUrl}/organizations/${createdOrgId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'Suspended' })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, 'Suspended');

    // Verify all users in this organization were deactivated
    const users = await query('SELECT is_active FROM users WHERE organization_id = $1', [createdOrgId]);
    assert.ok(users.rows.length > 0);
    assert.ok(users.rows.every(u => u.is_active === false), 'All users must be deactivated when org is suspended');
  });

  test('8. Platform Admin can reactivate an organization and verify Owner reactivation', async () => {
    const res = await fetch(`${platformBaseUrl}/organizations/${createdOrgId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ status: 'Active' })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, 'Active');

    // Verify Owner/Manager was reactivated
    const owners = await query(`
      SELECT u.is_active FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.organization_id = $1 AND r.name = 'Owner/Manager'
    `, [createdOrgId]);
    assert.equal(owners.rows[0].is_active, true, 'Owner/Manager must be reactivated');
  });

  test('9. Platform Admin can reset an organization manager password', async () => {
    const res = await fetch(`${platformBaseUrl}/organizations/${createdOrgId}/reset-manager-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.temporary_password);
    assert.equal(typeof body.data.temporary_password, 'string');
    assert.ok(body.data.owner.email);

    // Verify in database that must_change_password was set to TRUE
    const owner = await query('SELECT must_change_password FROM users WHERE id = $1', [body.data.owner.id]);
    assert.equal(owner.rows[0].must_change_password, true);
  });
});
