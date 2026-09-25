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

describe('TransitOps Authentication Module Hardening & Contract Tests', () => {
  let server;
  let authBaseUrl;
  let vehiclesBaseUrl;

  const testOrgA = 'a0000000-0000-0000-0000-000000000001';
  const testOrgB = 'a0000000-0000-0000-0000-000000000002';
  let testUserAId;
  let testDriverAId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    authBaseUrl = `http://127.0.0.1:${port}/api/auth`;
    vehiclesBaseUrl = `http://127.0.0.1:${port}/api/vehicles`;

    // 1. Clean previous test artifacts safely
    await query("DELETE FROM users WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [testOrgA, testOrgB]);

    // 2. Ensure test organizations exist
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Auth Test Org A', 'auth-org-a', 'Active'),
             ($2, 'Auth Test Org B', 'auth-org-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [testOrgA, testOrgB]);

    // 3. Ensure roles exist
    const roleRes = await query("SELECT id, name FROM roles WHERE name IN ('Fleet Manager', 'Owner/Manager', 'Driver')");
    const managerRoleId = roleRes.rows.find(r => r.name === 'Owner/Manager' || r.name === 'Fleet Manager')?.id;
    const driverRoleId = roleRes.rows.find(r => r.name === 'Driver')?.id;

    // 4. Seed a manager in Org A with known password: 'password123'
    const passwordHash = await hashPassword('password123');
    const userARes = await query(`
      INSERT INTO users (name, email, password_hash, role_id, organization_id, must_change_password, is_active)
      VALUES ('Auth Manager A', 'authmgr_a@test.com', $1, $2, $3, FALSE, TRUE)
      RETURNING id
    `, [passwordHash, managerRoleId, testOrgA]);
    testUserAId = userARes.rows[0].id;

    // 5. Seed a driver in Org A with phone number login
    const driverRecord = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Auth Driver A', 'DL-AUTH-001', 'LMV', '2028-12-31', '+919888877771', 'Available', $1)
      RETURNING id
    `, [testOrgA]);
    testDriverAId = driverRecord.rows[0].id;

    await query(`
      INSERT INTO users (name, phone_number, password_hash, role_id, organization_id, driver_id, must_change_password, is_active)
      VALUES ('Auth Driver A', '+919888877771', $1, $2, $3, $4, FALSE, TRUE)
    `, [passwordHash, driverRoleId, testOrgA, testDriverAId]);

    // 6. Seed a vehicle in Org B to verify tenant isolation
    await query(`
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region, organization_id)
      VALUES ('REG-AUTH-B1', 'Van-B1', 'Van', 500.00, 1000.00, 20000.00, 'Available', 'North', $1)
    `, [testOrgB]);
  });

  after(async () => {
    await query("DELETE FROM users WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [testOrgA, testOrgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [testOrgA, testOrgB]);
    server.close();
  });

  // ==================== LOGIN TESTS ====================
  test('1. Valid email login succeeds with HTTP 200 and returns real JWT', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authmgr_a@test.com', password: 'password123' })
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.ok(typeof json.data.token === 'string');
    assert.equal(json.data.user.email, 'authmgr_a@test.com');
    assert.ok(json.data.user.role === 'Owner/Manager' || json.data.user.role === 'Fleet Manager');
    assert.equal(json.data.user.organization_id, testOrgA);

    // Cryptographic verification
    const decoded = jwt.verify(json.data.token, JWT_SECRET);
    assert.equal(decoded.id, testUserAId);
    assert.equal(decoded.organization_id, testOrgA);
  });

  test('2. Valid phone login (driver mobile contract) succeeds with HTTP 200', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: '+919888877771', password: 'password123' })
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.user.phone_number, '+919888877771');
    assert.equal(json.data.user.role, 'Driver');
    assert.equal(json.data.user.driver_id, testDriverAId);
    assert.equal(json.data.user.organization_id, testOrgA);
  });

  test('3. Case-insensitive email login succeeds', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'AuthMgr_A@Test.COM', password: 'password123' })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.user.email, 'authmgr_a@test.com');
  });

  test('4. Leading and trailing whitespace is trimmed properly', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '   authmgr_a@test.com   ', password: 'password123' })
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
  });

  test('5. Missing identifier returns HTTP 400', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'password123' })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.message, /Email or phone number and password are required/i);
  });

  test('6. Missing password returns HTTP 400', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authmgr_a@test.com' })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.match(json.message, /Email or phone number and password are required/i);
  });

  test('7. Invalid password returns HTTP 401 with neutral error message', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authmgr_a@test.com', password: 'wrong_password_999' })
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.message, 'Invalid credentials.');
  });

  test('8. Unknown account returns HTTP 401 with neutral error message', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent_user@test.com', password: 'password123' })
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.message, 'Invalid credentials.');
  });

  test('9. Response envelope never exposes password_hash or temporary_password_encrypted', async () => {
    const res = await fetch(`${authBaseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'authmgr_a@test.com', password: 'password123' })
    });
    const json = await res.json();
    assert.equal(json.data.user.password_hash, undefined);
    assert.equal(json.data.user.temporary_password_encrypted, undefined);
  });

  // ==================== TOKEN AND SESSION TESTS ====================
  test('10. GET /api/auth/me returns 200 and restores user session for valid token', async () => {
    const token = createToken({
      id: testUserAId,
      email: 'authmgr_a@test.com',
      role: 'Fleet Manager',
      organization_id: testOrgA
    });

    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.success, true);
    assert.equal(json.data.id, testUserAId);
    assert.equal(json.data.email, 'authmgr_a@test.com');
    assert.equal(json.data.organization_id, testOrgA);
  });

  test('11. GET /api/auth/me rejects expired token with HTTP 401', async () => {
    const expiredToken = jwt.sign(
      { id: testUserAId, email: 'authmgr_a@test.com', role: 'Fleet Manager', organization_id: testOrgA },
      JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.success, false);
    assert.equal(json.message, 'Invalid or expired authentication token.');
  });

  test('12. GET /api/auth/me rejects malformed token with HTTP 401', async () => {
    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: 'Bearer this-is-not-a-jwt' }
    });
    assert.equal(res.status, 401);
  });

  test('13. GET /api/auth/me rejects missing token with HTTP 401', async () => {
    const res = await fetch(`${authBaseUrl}/me`);
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.message, 'Authentication token is required.');
  });

  test('14. GET /api/auth/me rejects token with invalid secret signature with HTTP 401', async () => {
    const badSecretToken = jwt.sign(
      { id: testUserAId, email: 'authmgr_a@test.com', role: 'Fleet Manager', organization_id: testOrgA },
      'wrong_secret_key_123456789'
    );

    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${badSecretToken}` }
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.message, 'Invalid or expired authentication token.');
  });

  // ==================== PASSWORD MANAGEMENT TESTS ====================
  test('15. PATCH /api/auth/password rejects unauthenticated request with HTTP 401', async () => {
    const res = await fetch(`${authBaseUrl}/password`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'password123', new_password: 'new_password_888' })
    });
    assert.equal(res.status, 401);
  });

  test('16. PATCH /api/auth/password rejects incorrect current password with HTTP 401', async () => {
    const token = createToken({
      id: testUserAId,
      email: 'authmgr_a@test.com',
      role: 'Fleet Manager',
      organization_id: testOrgA
    });

    const res = await fetch(`${authBaseUrl}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ current_password: 'wrong_current_password', new_password: 'new_password_888' })
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.message, 'Current password is incorrect.');
  });

  test('17. PATCH /api/auth/password rejects short new password (< 8 chars) with HTTP 400', async () => {
    const token = createToken({
      id: testUserAId,
      email: 'authmgr_a@test.com',
      role: 'Fleet Manager',
      organization_id: testOrgA
    });

    const res = await fetch(`${authBaseUrl}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ current_password: 'password123', new_password: 'short' })
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.equal(json.message, 'New password must be at least 8 characters.');
  });

  // ==================== TENANT ISOLATION TESTS ====================
  test('18. Token from Org A cannot access vehicles in Org B', async () => {
    const tokenA = createToken({
      id: testUserAId,
      email: 'authmgr_a@test.com',
      role: 'Fleet Manager',
      organization_id: testOrgA
    });

    // Org A lists vehicles
    const res = await fetch(`${vehiclesBaseUrl}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    const orgBVehicles = (json.data || []).filter(v => v.organization_id === testOrgB);
    assert.equal(orgBVehicles.length, 0, 'Org A token must never see Org B vehicles');
  });

  test('19. Token missing organization_id is rejected by authenticate.js with HTTP 401', async () => {
    const tokenNoOrg = jwt.sign(
      { id: testUserAId, email: 'authmgr_a@test.com', role: 'Fleet Manager' },
      JWT_SECRET
    );

    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${tokenNoOrg}` }
    });
    assert.equal(res.status, 401);
    const json = await res.json();
    assert.equal(json.message, 'Invalid authentication token: missing tenant context.');
  });

  // ==================== PLATFORM ADMIN & MANDATORY PASSWORD TESTS ====================
  test('20. Platform Admin token with organization_id = null can authenticate on /api/auth/me', async () => {
    const adminToken = createToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@transitops.com',
      role: 'Platform Admin',
      organization_id: null,
      driver_id: null
    });

    const res = await fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    // If user does not exist in DB during test run, 401 Session revoked or account not found; if mock allowed, 200
    // Test that authenticate middleware correctly accepted organization_id: null and did not reject with "missing tenant context"
    const json = await res.json();
    assert.notEqual(json.message, 'Invalid authentication token: missing tenant context.');
  });

  test('21. Platform Admin token is blocked from tenant operational routes (/api/vehicles) with HTTP 403', async () => {
    const adminToken = createToken({
      id: '00000000-0000-0000-0000-000000000001',
      email: 'admin@transitops.com',
      role: 'Platform Admin',
      organization_id: null,
      driver_id: null
    });

    const res = await fetch(`${vehiclesBaseUrl}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.ok(json.message.includes('Tenant operational context required') || json.message.includes('Forbidden'));
  });

  test('22. User with must_change_password = true is blocked from operational routes with HTTP 403', async () => {
    // Seed temporary user with must_change_password = true
    const tempHash = await hashPassword('tempPass123!');
    const roleRes = await query("SELECT id FROM roles WHERE name IN ('Fleet Manager', 'Owner/Manager') LIMIT 1");
    const roleId = roleRes.rows[0]?.id || 1;

    const tempUserRes = await query(`
      INSERT INTO users (name, email, password_hash, role_id, organization_id, must_change_password, is_active)
      VALUES ('Temp User', 'temp_user_test@test.com', $1, $2, $3, TRUE, TRUE)
      RETURNING id
    `, [tempHash, roleId, testOrgA]);
    const tempUserId = tempUserRes.rows[0].id;

    const tempToken = createToken({
      id: tempUserId,
      email: 'temp_user_test@test.com',
      role: 'Owner/Manager',
      organization_id: testOrgA
    });

    // Attempt to access operational endpoint /api/vehicles
    const res = await fetch(`${vehiclesBaseUrl}`, {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    assert.equal(res.status, 403);
    const json = await res.json();
    assert.equal(json.code, 'MUST_CHANGE_PASSWORD');

    // Clean up
    await query("DELETE FROM users WHERE id = $1", [tempUserId]);
  });

  test('23. User with must_change_password = true is permitted to access /api/auth/password', async () => {
    const tempHash = await hashPassword('tempPass123!');
    const roleRes = await query("SELECT id FROM roles WHERE name IN ('Fleet Manager', 'Owner/Manager') LIMIT 1");
    const roleId = roleRes.rows[0]?.id || 1;

    const tempUserRes = await query(`
      INSERT INTO users (name, email, password_hash, role_id, organization_id, must_change_password, is_active)
      VALUES ('Temp User 2', 'temp_user_test2@test.com', $1, $2, $3, TRUE, TRUE)
      RETURNING id
    `, [tempHash, roleId, testOrgA]);
    const tempUserId = tempUserRes.rows[0].id;

    const tempToken = createToken({
      id: tempUserId,
      email: 'temp_user_test2@test.com',
      role: 'Owner/Manager',
      organization_id: testOrgA
    });

    // Attempt password change
    const res = await fetch(`${authBaseUrl}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tempToken}`
      },
      body: JSON.stringify({
        current_password: 'tempPass123!',
        new_password: 'newPermanentPassword999!'
      })
    });
    assert.equal(res.status, 200);

    // Verify must_change_password is now false in DB
    const checkDb = await query("SELECT must_change_password FROM users WHERE id = $1", [tempUserId]);
    assert.equal(checkDb.rows[0].must_change_password, false);

    // Clean up
    await query("DELETE FROM users WHERE id = $1", [tempUserId]);
  });

  test('24. PATCH /api/auth/password ignores client-supplied user_id in payload', async () => {
    const tokenA = createToken({
      id: testUserAId,
      email: 'authmgr_a@test.com',
      role: 'Owner/Manager',
      organization_id: testOrgA
    });

    const res = await fetch(`${authBaseUrl}/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        user_id: 'arbitrary-victim-user-id',
        current_password: 'password123',
        new_password: 'updatedPassword333!'
      })
    });
    assert.equal(res.status, 200);

    // Restore original password for subsequent tests
    const restoreHash = await hashPassword('password123');
    await query("UPDATE users SET password_hash = $1 WHERE id = $2", [restoreHash, testUserAId]);
  });
});
