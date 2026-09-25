const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const Driver = require('../src/models/driverModel');
const Trip = require('../src/models/tripModel');
const Vehicle = require('../src/models/vehicleModel');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('Multi-Tenant Organization Isolation Verification', () => {
  let server;
  let baseUrl;
  let driverBaseUrl;

  const orgA = '90000000-0000-0000-0000-000000000001';
  const orgB = '90000000-0000-0000-0000-000000000002';

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
    tokenManagerA = createToken({ id: '90000000-0000-0000-0000-000000000901', email: 'mgrA@iso.com', role: 'Owner/Manager', organization_id: orgA });
    tokenManagerB = createToken({ id: '90000000-0000-0000-0000-000000000902', email: 'mgrB@iso.com', role: 'Owner/Manager', organization_id: orgB });
    tokenNoOrg = jwt.sign({ id: '90000000-0000-0000-0000-000000000903', email: 'noorg@iso.com', role: 'Owner/Manager' }, JWT_SECRET, { expiresIn: '1h' });

    // Clean test data
    await query("DELETE FROM users WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [orgA, orgB]);

    // Ensure test organizations exist to satisfy referential integrity
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Org Iso A', 'org-iso-a', 'Active'),
             ($2, 'Org Iso B', 'org-iso-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [orgA, orgB]);

    // Seed one driver in Org B
    const dRes = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Org B Driver', 'LIC-ISO-B1', 'HMV', '2028-01-01', '+919800000001', 'Available', $1)
      RETURNING id
    `, [orgB]);
    driverBId = dRes.rows[0].id;
  });

  after(async () => {
    await query("DELETE FROM users WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [orgA, orgB]);
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

  test('14b. Direct DB insert with nonexistent organization_id fails with code 23503 (foreign_key_violation)', async () => {
    try {
      await query(`
        INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
        VALUES ('Ghost Driver', 'LIC-GHOST-1', 'LMV', '2028-01-01', '+919999999999', 'Available', '00000000-0000-0000-0000-000000000999')
      `);
      assert.fail('Expected insert with nonexistent organization_id to fail foreign key check');
    } catch (err) {
      // PostgreSQL error code 23503 = foreign_key_violation
      assert.equal(err.code, '23503');
      assert.ok(err.constraint.includes('organization') || err.constraint.includes('fkey') || err.constraint.includes('drivers'));
    }
  });

  test('14c. Deleting organization with existing dependent records fails with code 23503 (RESTRICT)', async () => {
    try {
      await query("DELETE FROM organizations WHERE id = $1", [orgB]);
      assert.fail('Expected deleting organization with active driver to fail RESTRICT check');
    } catch (err) {
      // PostgreSQL error code 23503 = foreign_key_violation, 23001 = restrict_violation (PostgreSQL 18+)
      assert.ok(['23503', '23001'].includes(err.code), `Expected 23503 or 23001, got ${err.code}`);
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

    // Vehicle.findAll
    await assert.rejects(async () => { await Vehicle.findAll({}); }, /organization_id is mandatory/);
    // Vehicle.findById
    await assert.rejects(async () => { await Vehicle.findById(1); }, /organization_id is mandatory/);
    // Vehicle.findByIdWithClient
    await assert.rejects(async () => { await Vehicle.findByIdWithClient({}, 1); }, /organization_id is mandatory/);
    // Vehicle.findByIdForUpdate
    await assert.rejects(async () => { await Vehicle.findByIdForUpdate({}, 1); }, /organization_id is mandatory/);
    // Vehicle.create
    await assert.rejects(async () => { await Vehicle.create({ registration_number: 'R', name: 'N', type: 'T', max_load_capacity: 1000 }); }, /organization_id is mandatory/);
    // Vehicle.update
    await assert.rejects(async () => { await Vehicle.update(1, { name: 'X' }); }, /organization_id is mandatory/);
    // Vehicle.delete
    await assert.rejects(async () => { await Vehicle.delete(1); }, /organization_id is mandatory/);
    // Vehicle.setStatus
    await assert.rejects(async () => { await Vehicle.setStatus(1, 'Available'); }, /organization_id is mandatory/);
    // Vehicle.setStatusWithClient
    await assert.rejects(async () => { await Vehicle.setStatusWithClient({}, 1, 'Available'); }, /organization_id is mandatory/);
    // Vehicle.releaseIfOnTrip
    await assert.rejects(async () => { await Vehicle.releaseIfOnTrip({}, 1); }, /organization_id is mandatory/);
    // Vehicle.findByRegistration
    await assert.rejects(async () => { await Vehicle.findByRegistration('TEST-REG', null); }, /organization_id is mandatory/);
    await assert.rejects(async () => { await Vehicle.findByRegistration('TEST-REG', ''); }, /organization_id is mandatory/);

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

  // ==========================================
  // 6. VEHICLE DATA LAYER & TENANT ISOLATION
  // ==========================================

  let testVehicleAId;
  let testVehicleBId;

  test('19. Create vehicle with sub_category and organization_id', async () => {
    const v = await Vehicle.create({
      registration_number: 'TEST-VEH-A1',
      name: 'Cargo Van A',
      type: 'Van',
      sub_category: 'Medium-Duty',
      max_load_capacity: 1500,
      acquisition_cost: 30000,
      status: 'Available',
      organization_id: orgA
    });
    assert.ok(v.id);
    assert.equal(v.organization_id, orgA);
    assert.equal(v.sub_category, 'Medium-Duty');
    testVehicleAId = v.id;

    // Create a vehicle in Org B
    const vB = await Vehicle.create({
      registration_number: 'TEST-VEH-B1',
      name: 'Cargo Truck B',
      type: 'Truck',
      sub_category: 'Heavy-Duty',
      max_load_capacity: 5000,
      acquisition_cost: 60000,
      status: 'Available',
      organization_id: orgB
    });
    assert.ok(vB.id);
    assert.equal(vB.organization_id, orgB);
    assert.equal(vB.sub_category, 'Heavy-Duty');
    testVehicleBId = vB.id;
  });

  test('20. Vehicle.findById requires correct organization_id; wrong org returns undefined', async () => {
    // Org A retrieves its own vehicle
    const own = await Vehicle.findById(testVehicleAId, orgA);
    assert.ok(own);
    assert.equal(own.id, testVehicleAId);
    assert.equal(own.sub_category, 'Medium-Duty');
    assert.equal(typeof own.trips_count, 'number');
    assert.equal(own.trips_count, 0);

    // Org B attempts to retrieve Org A's vehicle -> returns undefined
    const cross = await Vehicle.findById(testVehicleAId, orgB);
    assert.equal(cross, undefined);
  });

  test('21. Vehicle.findAll strictly filters by organization_id', async () => {
    const orgAVehicles = await Vehicle.findAll({ organization_id: orgA });
    assert.ok(orgAVehicles.length > 0);
    assert.ok(orgAVehicles.every(v => v.organization_id === orgA));
    assert.ok(!orgAVehicles.some(v => v.id === testVehicleBId));

    const orgBVehicles = await Vehicle.findAll({ organization_id: orgB });
    assert.ok(orgBVehicles.length > 0);
    assert.ok(orgBVehicles.every(v => v.organization_id === orgB));
    assert.ok(!orgBVehicles.some(v => v.id === testVehicleAId));
  });

  test('22. Vehicle.update blocked across tenants', async () => {
    // Org B attempts to update Org A's vehicle
    const hack = await Vehicle.update(testVehicleAId, { name: 'Compromised Name' }, orgB);
    assert.equal(hack, undefined);

    // Verify Org A vehicle remains unchanged in database
    const check = await Vehicle.findById(testVehicleAId, orgA);
    assert.equal(check.name, 'Cargo Van A');

    // Org A updates its own vehicle -> succeeds
    const legit = await Vehicle.update(testVehicleAId, { name: 'Updated Cargo Van A' }, orgA);
    assert.equal(legit.name, 'Updated Cargo Van A');
  });

  test('23. Vehicle.delete blocked across tenants', async () => {
    // Org B attempts to delete Org A's vehicle
    const delHack = await Vehicle.delete(testVehicleAId, orgB);
    assert.equal(delHack, undefined);

    // Verify vehicle still exists in Org A
    const check = await Vehicle.findById(testVehicleAId, orgA);
    assert.ok(check);
  });

  test('24. Vehicle.findByIdForUpdate within transaction is tenant-scoped', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Org B attempts to lock Org A's vehicle -> returns undefined
      const crossLock = await Vehicle.findByIdForUpdate(client, testVehicleAId, orgB);
      assert.equal(crossLock, undefined);

      // Org A locks its own vehicle -> succeeds
      const ownLock = await Vehicle.findByIdForUpdate(client, testVehicleAId, orgA);
      assert.ok(ownLock);
      assert.equal(ownLock.id, testVehicleAId);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  test('25. Vehicle.setStatus and setStatusWithClient are tenant-scoped', async () => {
    // Org B attempts to change status of Org A vehicle
    const hackStatus = await Vehicle.setStatus(testVehicleAId, 'Retired', orgB);
    assert.equal(hackStatus, undefined);

    // Verify status untouched
    let v = await Vehicle.findById(testVehicleAId, orgA);
    assert.equal(v.status, 'Available');

    // Transactional test with client
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const crossClient = await Vehicle.setStatusWithClient(client, testVehicleAId, 'Retired', orgB);
      assert.equal(crossClient, undefined);

      const legitClient = await Vehicle.setStatusWithClient(client, testVehicleAId, 'On Trip', orgA);
      assert.ok(legitClient);
      assert.equal(legitClient.status, 'On Trip');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  test('26. Vehicle.releaseIfOnTrip is tenant-scoped and preserves non-On-Trip statuses', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Vehicle is 'On Trip'. Org B tries to release -> fails / returns undefined
      const crossRelease = await Vehicle.releaseIfOnTrip(client, testVehicleAId, orgB);
      assert.equal(crossRelease, undefined);

      // 2. Org A releases its own 'On Trip' vehicle -> restored to 'Available'
      const legitRelease = await Vehicle.releaseIfOnTrip(client, testVehicleAId, orgA);
      assert.ok(legitRelease);
      assert.equal(legitRelease.status, 'Available');

      // 3. Mark vehicle as 'In Shop'. releaseIfOnTrip must NOT overwrite it to Available
      await Vehicle.setStatusWithClient(client, testVehicleAId, 'In Shop', orgA);
      const inShopRelease = await Vehicle.releaseIfOnTrip(client, testVehicleAId, orgA);
      assert.equal(inShopRelease, undefined);

      // Verify it remains 'In Shop'
      const checkInShop = await client.query('SELECT status FROM vehicles WHERE id = $1', [testVehicleAId]);
      assert.equal(checkInShop.rows[0].status, 'In Shop');

      // Reset to Available for subsequent tests
      await Vehicle.setStatusWithClient(client, testVehicleAId, 'Available', orgA);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  test('27. Dynamic trips_count calculates only Completed trips for that vehicle and tenant', async () => {
    // Initial trips_count is 0
    let v = await Vehicle.findById(testVehicleAId, orgA);
    assert.equal(v.trips_count, 0);

    // Create Completed trip for Vehicle A in Org A
    await query(`
      INSERT INTO trips (
        organization_id, origin, destination, planned_route,
        vehicle_id, cargo_weight, planned_distance, actual_distance,
        start_time, expected_arrival, actual_arrival, status
      ) VALUES (
        $1, 'Point A', 'Point B', 'Route 1',
        $2, 100, 50, 50,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '1 hour', 'Completed'
      )
    `, [orgA, testVehicleAId]);

    // Now trips_count is 1
    v = await Vehicle.findById(testVehicleAId, orgA);
    assert.equal(v.trips_count, 1);

    // Create Cancelled trip for Vehicle A in Org A
    await query(`
      INSERT INTO trips (
        organization_id, origin, destination, planned_route,
        vehicle_id, cargo_weight, planned_distance,
        start_time, expected_arrival, status
      ) VALUES (
        $1, 'Point A', 'Point C', 'Route 2',
        $2, 100, 50,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', 'Cancelled'
      )
    `, [orgA, testVehicleAId]);

    // Create Dispatched trip for Vehicle A in Org A
    await query(`
      INSERT INTO trips (
        organization_id, origin, destination, planned_route,
        vehicle_id, cargo_weight, planned_distance,
        start_time, expected_arrival, status
      ) VALUES (
        $1, 'Point A', 'Point D', 'Route 3',
        $2, 100, 50,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 hour', 'Dispatched'
      )
    `, [orgA, testVehicleAId]);

    // trips_count must STILL be 1 (Cancelled and Dispatched are excluded!)
    v = await Vehicle.findById(testVehicleAId, orgA);
    assert.equal(v.trips_count, 1);

    // Also check Vehicle.findAll returns calculated trips_count = 1
    const all = await Vehicle.findAll({ organization_id: orgA });
    const found = all.find(item => item.id === testVehicleAId);
    assert.ok(found);
    assert.equal(found.trips_count, 1);
  });

  test('28. trips_count is dynamically calculated and is NOT a stored column', async () => {
    const res = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'trips_count'"
    );
    assert.equal(res.rows.length, 0, 'trips_count should NOT be a stored column on vehicles table');
  });

  test('29. sub_category column exists in vehicles table and is nullable', async () => {
    const res = await query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'sub_category'"
    );
    assert.equal(res.rows.length, 1, 'sub_category column must exist on vehicles table');
    assert.equal(res.rows[0].data_type, 'character varying');
    assert.equal(res.rows[0].is_nullable, 'YES');
  });

  // ==========================================
  // 7. REGISTRATION SCOPING & OWNERSHIP IMMUTABILITY
  // ==========================================

  test('30. findByRegistration without organization_id throws mandatory error', async () => {
    await assert.rejects(
      async () => { await Vehicle.findByRegistration('TEST-VEH-A1'); },
      /organization_id is mandatory/
    );
    await assert.rejects(
      async () => { await Vehicle.findByRegistration('TEST-VEH-A1', null); },
      /organization_id is mandatory/
    );
    await assert.rejects(
      async () => { await Vehicle.findByRegistration('TEST-VEH-A1', '  '); },
      /organization_id is mandatory/
    );
  });

  test('31. findByRegistration with wrong organization_id cannot find another tenant vehicle', async () => {
    // Org B looks for Org A's vehicle registration -> returns undefined (no cross-tenant leakage)
    const crossResult = await Vehicle.findByRegistration('TEST-VEH-A1', orgB);
    assert.equal(crossResult, undefined);

    // Org A looks for Org B's vehicle registration -> returns undefined
    const crossResult2 = await Vehicle.findByRegistration('TEST-VEH-B1', orgA);
    assert.equal(crossResult2, undefined);
  });

  test('32. findByRegistration with correct organization_id returns vehicle', async () => {
    const ownResult = await Vehicle.findByRegistration('TEST-VEH-A1', orgA);
    assert.ok(ownResult);
    assert.equal(ownResult.id, testVehicleAId);
    assert.equal(ownResult.registration_number, 'TEST-VEH-A1');
    assert.equal(ownResult.organization_id, orgA);
  });

  test('33. findByRegistration with ID exclusion remains strictly tenant-scoped', async () => {
    // Exclude own ID -> should return undefined
    const excludedOwn = await Vehicle.findByRegistration('TEST-VEH-A1', orgA, testVehicleAId);
    assert.equal(excludedOwn, undefined);

    // Exclude different ID (e.g. 00000000-0000-0000-0000-000000000999) -> should return the vehicle
    const excludedOther = await Vehicle.findByRegistration('TEST-VEH-A1', orgA, '00000000-0000-0000-0000-000000000999');
    assert.ok(excludedOther);
    assert.equal(excludedOther.id, testVehicleAId);

    // Exclude different ID with wrong tenant -> still returns undefined
    const excludedWrongTenant = await Vehicle.findByRegistration('TEST-VEH-A1', orgB, '00000000-0000-0000-0000-000000000999');
    assert.equal(excludedWrongTenant, undefined);
  });

  test('34. Vehicle.update cannot alter organization_id (tenant ownership immutability)', async () => {
    // Attempt 1: Caller sends organization_id: orgB in update fields to legitimately owned Org A vehicle
    const attempt1 = await Vehicle.update(
      testVehicleAId,
      { name: 'Tamper Attempt 1', organization_id: orgB },
      orgA
    );
    assert.ok(attempt1);
    assert.equal(attempt1.name, 'Tamper Attempt 1');
    assert.equal(attempt1.organization_id, orgA, 'organization_id must not change from update payload');

    // Verify directly in DB that organization_id was untouched
    const dbCheck = await query('SELECT organization_id FROM vehicles WHERE id = $1', [testVehicleAId]);
    assert.equal(dbCheck.rows[0].organization_id, orgA);

    // Attempt 2: Only organization_id is passed in fields -> returns null (no valid fields to update)
    const attempt2 = await Vehicle.update(testVehicleAId, { organization_id: orgB }, orgA);
    assert.equal(attempt2, null);

    // Attempt 3: Cross-tenant update attempt from Org B targeting Org A vehicle
    const attempt3 = await Vehicle.update(testVehicleAId, { name: 'Tamper Attempt 3' }, orgB);
    assert.equal(attempt3, undefined);

    // Final verification: Vehicle is still in Org A
    const finalCheck = await Vehicle.findById(testVehicleAId, orgA);
    assert.ok(finalCheck);
    assert.equal(finalCheck.organization_id, orgA);
  });
});

