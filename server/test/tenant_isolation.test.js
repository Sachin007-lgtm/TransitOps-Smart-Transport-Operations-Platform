const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query } = require('../src/config/db');
const Driver = require('../src/models/driverModel');
const Trip = require('../src/models/tripModel');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('Multi-Tenant Organization Isolation Verification', () => {
  let server;
  let baseUrl;
  let driverBaseUrl;

  const orgA = 'org-iso-A';
  const orgB = 'org-iso-B';

  let tokenManagerA;
  let tokenManagerB;
  let tokenNoOrg;

  let driverBId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/trips`;
    driverBaseUrl = `http://127.0.0.1:${port}/api/drivers`;

    // Tokens
    tokenManagerA = createToken({ id: 901, email: 'mgrA@iso.com', role: 'Fleet Manager', organization_id: orgA });
    tokenManagerB = createToken({ id: 902, email: 'mgrB@iso.com', role: 'Fleet Manager', organization_id: orgB });
    tokenNoOrg = jwt.sign({ id: 903, email: 'noorg@iso.com', role: 'Fleet Manager' }, JWT_SECRET, { expiresIn: '1h' });

    // Clean test data
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);

    // Seed one driver in Org B
    const dRes = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Org B Driver', 'LIC-ISO-B1', 'HMV', '2028-01-01', '+919800000001', 'Available', $1)
      RETURNING id
    `, [orgB]);
    driverBId = dRes.rows[0].id;
  });

  after(async () => {
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    server.close();
  });

  async function api(url, { method = 'GET', body = null, token = tokenManagerA } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // ==========================================
  // 1. AUTHENTICATION & TOKEN CONTEXT
  // ==========================================

  test('1. Unauthenticated driver request returns 401', async () => {
    const res = await api(driverBaseUrl, { method: 'GET', token: null });
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  test('2. JWT without organization_id is rejected with 401', async () => {
    const res = await api(driverBaseUrl, { method: 'GET', token: tokenNoOrg });
    assert.equal(res.status, 401);
    assert.ok(res.data.message.includes('missing tenant context'));
  });

  test('3. Valid authenticated request uses JWT organization', async () => {
    const res = await api(driverBaseUrl, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
  });

  // ==========================================
  // 2. DRIVER TENANT ISOLATION
  // ==========================================

  test('4. Org A creates driver without organization_id in body -> saved under Org A', async () => {
    const payload = {
      name: 'Driver In A',
      license_number: 'LIC-ISO-A1',
      license_category: 'LMV',
      license_expiry_date: '2028-12-31',
      contact_number: '+919999900001'
    };
    const res = await api(driverBaseUrl, { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 201);
    assert.equal(res.data.data.organization_id, orgA);

    // Verify in DB directly
    const dbCheck = await query('SELECT organization_id FROM drivers WHERE id = $1', [res.data.data.id]);
    assert.equal(dbCheck.rows[0].organization_id, orgA);
  });

  test('5. Org A submits organization_id: "org-iso-B" in body -> driver still saved under Org A (override ignored)', async () => {
    const payload = {
      name: 'Driver Spoof Attempt',
      license_number: 'LIC-ISO-A2',
      license_category: 'LMV',
      license_expiry_date: '2028-12-31',
      contact_number: '+919999900002',
      organization_id: orgB // Client tries to spoof Org B
    };
    const res = await api(driverBaseUrl, { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 201);
    assert.equal(res.data.data.organization_id, orgA); // Overridden to authenticated org

    // Verify in DB directly
    const dbCheck = await query('SELECT organization_id FROM drivers WHERE id = $1', [res.data.data.id]);
    assert.equal(dbCheck.rows[0].organization_id, orgA);
  });

  test('6. Org A driver list does not contain Org B drivers', async () => {
    const res = await api(driverBaseUrl, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 200);
    assert.ok(res.data.data.every(d => d.organization_id === orgA));
    assert.ok(!res.data.data.some(d => d.id === driverBId));
  });

  test('7. Org A cannot fetch Org B driver (returns 404)', async () => {
    const res = await api(`${driverBaseUrl}/${driverBId}`, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 404);
  });

  test('8. Org A cannot update Org B driver (returns 404)', async () => {
    const res = await api(`${driverBaseUrl}/${driverBId}`, {
      method: 'PUT',
      body: { name: 'Hacked Name' },
      token: tokenManagerA
    });
    assert.equal(res.status, 404);

    // Verify driver in DB unchanged
    const dbCheck = await query('SELECT name FROM drivers WHERE id = $1', [driverBId]);
    assert.equal(dbCheck.rows[0].name, 'Org B Driver');
  });

  test('9. Org A cannot delete Org B driver (returns 404)', async () => {
    const res = await api(`${driverBaseUrl}/${driverBId}`, {
      method: 'DELETE',
      token: tokenManagerA
    });
    assert.equal(res.status, 404);

    // Verify driver in DB still exists
    const dbCheck = await query('SELECT id FROM drivers WHERE id = $1', [driverBId]);
    assert.equal(dbCheck.rows.length, 1);
  });

  test('10. Missing organization context cannot fall back to org-1', async () => {
    // Attempting to call Driver.create without organization_id throws an error
    await assert.rejects(
      async () => {
        await Driver.create({
          name: 'No Org Driver',
          license_number: 'LIC-FAIL-1',
          license_category: 'LMV',
          license_expiry_date: '2028-12-31',
          contact_number: '+919999900099'
        });
      },
      /organization_id is mandatory/
    );
  });

  // ==========================================
  // 3. DATABASE SCHEMA ENFORCEMENT
  // ==========================================

  test('11. Confirm organization_id has column_default = null in trips, vehicles, drivers, users', async () => {
    const res = await query(
      "SELECT table_name, column_default FROM information_schema.columns WHERE column_name = 'organization_id'"
    );
    for (const row of res.rows) {
      assert.equal(row.column_default, null, `Expected column_default for ${row.table_name} to be null`);
    }
  });

  test('12-14. Direct DB insert omitting organization_id fails with code 23502 on column organization_id', async () => {
    try {
      await query(`
        INSERT INTO trips (
          origin, destination, planned_route, cargo_weight, planned_distance, start_time, expected_arrival
        ) VALUES (
          'Test Origin', 'Test Dest', 'Route 1', 100, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour'
        )
      `);
      assert.fail('Expected insert omitting organization_id to fail');
    } catch (err) {
      // PostgreSQL error code 23502 = not_null_violation
      assert.equal(err.code, '23502');
      assert.equal(err.column, 'organization_id');
    }
  });

  // ==========================================
  // 4. TRIP TENANT ISOLATION
  // ==========================================

  test('15. Client-provided organization_id cannot override authenticated organization during trip creation', async () => {
    const payload = {
      origin: 'City One',
      destination: 'City Two',
      planned_route: 'Highway 1',
      start_time: '2026-11-01T10:00:00Z',
      expected_arrival: '2026-11-01T14:00:00Z',
      organization_id: orgB // Client attempts to create trip under Org B
    };
    const res = await api(baseUrl, { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 201);
    assert.equal(res.data.data.organization_id, orgA); // Stored as Org A

    const tripId = res.data.data.id;
    const dbCheck = await query('SELECT organization_id FROM trips WHERE id = $1', [tripId]);
    assert.equal(dbCheck.rows[0].organization_id, orgA);
  });

  test('16-17. Trip update cannot modify a trip belonging to another organization (SQL tenant scope)', async () => {
    // Create a trip in Org B
    const createB = await api(baseUrl, {
      method: 'POST',
      body: {
        origin: 'Org B Origin',
        destination: 'Org B Dest',
        planned_route: 'Route B',
        start_time: '2026-11-02T10:00:00Z',
        expected_arrival: '2026-11-02T14:00:00Z'
      },
      token: tokenManagerB
    });
    const tripBId = createB.data.data.id;

    // Org A attempts to update Org B's trip
    const updateRes = await api(`${baseUrl}/${tripBId}`, {
      method: 'PATCH',
      body: { destination: 'Hacked Destination' },
      token: tokenManagerA
    });
    assert.equal(updateRes.status, 404);

    // Direct model test: Trip.update with Org A's ID on Org B's trip returns undefined/null
    const directUpdate = await Trip.update(tripBId, { destination: 'Hacked Directly' }, orgA);
    assert.equal(directUpdate, undefined);

    // Verify Org B trip in DB was untouched
    const dbCheck = await query('SELECT destination FROM trips WHERE id = $1', [tripBId]);
    assert.equal(dbCheck.rows[0].destination, 'Org B Dest');
  });

  // ==========================================
  // 5. MANDATORY TENANT SCOPING VERIFICATION
  // ==========================================

  test('18. Tenant-sensitive Driver and Trip methods throw an error when called without organization_id', async () => {
    // Driver.findAll
    await assert.rejects(async () => { await Driver.findAll({}); }, /organization_id is mandatory/);
    // Driver.findById
    await assert.rejects(async () => { await Driver.findById(1); }, /organization_id is mandatory/);
    // Driver.findByIdForUpdate
    await assert.rejects(async () => { await Driver.findByIdForUpdate({}, 1); }, /organization_id is mandatory/);
    // Driver.update
    await assert.rejects(async () => { await Driver.update(1, { name: 'X' }); }, /organization_id is mandatory/);
    // Driver.delete
    await assert.rejects(async () => { await Driver.delete(1); }, /organization_id is mandatory/);
    // Driver.setStatus
    await assert.rejects(async () => { await Driver.setStatus(1, 'Available'); }, /organization_id is mandatory/);
    // Driver.releaseIfOnTrip
    await assert.rejects(async () => { await Driver.releaseIfOnTrip({}, 1); }, /organization_id is mandatory/);

    // Trip.create
    await assert.rejects(async () => { await Trip.create({ origin: 'O', destination: 'D', planned_route: 'R', start_time: new Date(), expected_arrival: new Date() }); }, /organization_id is mandatory/);
    // Trip.findById
    await assert.rejects(async () => { await Trip.findById(1); }, /organization_id is mandatory/);
    // Trip.findAll
    await assert.rejects(async () => { await Trip.findAll({}); }, /organization_id is mandatory/);
    // Trip.findByIdForUpdate
    await assert.rejects(async () => { await Trip.findByIdForUpdate({}, 1); }, /organization_id is mandatory/);
    // Trip.update
    await assert.rejects(async () => { await Trip.update(1, { destination: 'X' }); }, /organization_id is mandatory/);
    // Trip.delete
    await assert.rejects(async () => { await Trip.delete(1); }, /organization_id is mandatory/);
  });
});
