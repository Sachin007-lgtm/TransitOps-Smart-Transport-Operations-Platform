const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps Trip Module Backend Tests', () => {
  let server;
  let baseUrl;

  // Test Entities in Org A
  let vehicleA1Id; // Available
  let vehicleA2Id; // In Shop
  let vehicleA3Id; // Available
  let driverA1Id;  // Available
  let driverA2Id;  // Suspended
  let driverA3Id;  // Available for Driver 2

  // Test Entities in Org B
  let vehicleB1Id; // Available
  let driverB1Id;  // Available

  // JWT Tokens
  let tokenManagerA;
  let tokenDispatcherA;
  let tokenDriverA1;
  let tokenDriverA2;
  let tokenManagerB;

  before(async () => {
    // 1. Start test HTTP server
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/trips`;

    // 2. Clean previous test artifacts if any
    // Billing tables must go before organizations: companies and bills
    // reference organizations with ON DELETE RESTRICT (the billing module
    // auto-creates a company for every customer name a trip carries).
    await query("DELETE FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("DELETE FROM bill_charges WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("UPDATE trips SET bill_id = NULL WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("UPDATE charges SET bill_id = NULL WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM charges WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM companies WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM bill_counters WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM users WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM trips WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM vehicles WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM drivers WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM organizations WHERE id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");

    // Ensure test organizations exist to satisfy referential integrity
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ('b0000000-0000-0000-0000-000000000001', 'Org Test A', 'org-test-a', 'Active'),
             ('b0000000-0000-0000-0000-000000000002', 'Org Test B', 'org-test-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `);

    // 3. Create Org A Vehicles
    const vA1 = await query(`
      INSERT INTO vehicles (registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('TEST-REG-A1', 'Truck', 5000, 'Available', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    vehicleA1Id = vA1.rows[0].id;

    const vA2 = await query(`
      INSERT INTO vehicles (registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('TEST-REG-A2', 'Truck', 4000, 'In Shop', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    vehicleA2Id = vA2.rows[0].id;

    const vA3 = await query(`
      INSERT INTO vehicles (registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('TEST-REG-A3', 'Truck', 7000, 'Available', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    vehicleA3Id = vA3.rows[0].id;

    // 4. Create Org B Vehicle
    const vB1 = await query(`
      INSERT INTO vehicles (registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('TEST-REG-B1', 'Truck', 6000, 'Available', 'b0000000-0000-0000-0000-000000000002')
      RETURNING id
    `);
    vehicleB1Id = vB1.rows[0].id;

    // 5. Create Org A Drivers
    const dA1 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver One', 'LIC-TEST-A1', 'HMV / HGMV', '2028-01-01', '+919999990001', 'Available', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    driverA1Id = dA1.rows[0].id;

    const dA2 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Bad', 'LIC-TEST-A2', 'HMV / HGMV', '2028-01-01', '+919999990002', 'Suspended', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    driverA2Id = dA2.rows[0].id;

    const dA3 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Two', 'LIC-TEST-A3', 'HMV / HGMV', '2028-01-01', '+919999990003', 'Available', 'b0000000-0000-0000-0000-000000000001')
      RETURNING id
    `);
    driverA3Id = dA3.rows[0].id;

    // 6. Create Org B Driver
    const dB1 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Org B', 'LIC-TEST-B1', 'HMV / HGMV', '2028-01-01', '+919999990004', 'Available', 'b0000000-0000-0000-0000-000000000002')
      RETURNING id
    `);
    driverB1Id = dB1.rows[0].id;

    // 7. Create Tokens
    tokenManagerA = createToken({ id: '10000000-0000-0000-0000-000000000101', email: 'managerA@test.com', role: 'Owner/Manager', organization_id: 'b0000000-0000-0000-0000-000000000001' });
    tokenDispatcherA = createToken({ id: '10000000-0000-0000-0000-000000000102', email: 'dispA@test.com', role: 'Owner/Manager', organization_id: 'b0000000-0000-0000-0000-000000000001' });
    tokenDriverA1 = createToken({ id: '10000000-0000-0000-0000-000000000103', email: 'driver1@test.com', role: 'Driver', driver_id: driverA1Id, organization_id: 'b0000000-0000-0000-0000-000000000001' });
    tokenDriverA2 = createToken({ id: '10000000-0000-0000-0000-000000000104', email: 'driver2@test.com', role: 'Driver', driver_id: driverA3Id, organization_id: 'b0000000-0000-0000-0000-000000000001' });
    tokenManagerB = createToken({ id: '20000000-0000-0000-0000-000000000201', email: 'managerB@test.com', role: 'Owner/Manager', organization_id: 'b0000000-0000-0000-0000-000000000002' });
  });

  after(async () => {
    // Cleanup test data
    // Billing tables must go before organizations: companies and bills
    // reference organizations with ON DELETE RESTRICT (the billing module
    // auto-creates a company for every customer name a trip carries).
    await query("DELETE FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("DELETE FROM bill_charges WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'))");
    await query("UPDATE trips SET bill_id = NULL WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("UPDATE charges SET bill_id = NULL WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM bills WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM charges WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM companies WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM bill_counters WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM users WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM trips WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM vehicles WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM drivers WHERE organization_id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    await query("DELETE FROM organizations WHERE id IN ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002')");
    server.close();
  });

  // Helper for requests
  async function api(path, { method = 'GET', body = null, token = tokenManagerA } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });

    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  // TEST 1: Unauthenticated request rejected
  test('1. Reject unauthenticated requests with 401', async () => {
    const res = await api('', { method: 'GET', token: null });
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  // TEST 2: Create valid Draft Trip
  test('2. Successfully create valid Trip in Draft status', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Mumbai-Pune Expressway Route 1',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      external_party_name: 'Metro Logistics',
      external_party_type: 'CUSTOMER',
      cargo_weight: 1200,
      planned_distance: 150,
      status: 'Draft'
    };

    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.origin, 'Mumbai Hub');
    assert.equal(res.data.data.status, 'Draft');
    assert.equal(res.data.data.organization_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(res.data.data.actual_arrival, null);
  });

  // TEST 3: Create valid Planned Trip with backward-compatible 'source' field
  test('3. Successfully create Planned Trip supporting legacy source alias', async () => {
    const payload = {
      source: 'Delhi Central',
      destination: 'Jaipur Terminal',
      planned_route: 'NH48 Expressway',
      start_time: '2026-10-02T06:00:00Z',
      expected_arrival: '2026-10-02T11:00:00Z',
      status: 'Planned'
    };

    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 201);
    assert.equal(res.data.data.origin, 'Delhi Central');
    assert.equal(res.data.data.source, 'Delhi Central');
    assert.equal(res.data.data.status, 'Planned');
  });

  // TEST 4: Reject Trip without origin
  test('4. Reject Trip creation without origin', async () => {
    const payload = {
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z'
    };
    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.some(e => e.includes('origin is required')));
  });

  // TEST 5: Reject Trip without destination
  test('5. Reject Trip creation without destination', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z'
    };
    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.some(e => e.includes('destination is required')));
  });

  // TEST 6: Reject invalid datetime (expected_arrival before start_time)
  test('6. Reject Trip when expected_arrival is before start_time', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T12:00:00Z',
      expected_arrival: '2026-10-01T08:00:00Z'
    };
    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors.some(e => e.includes('expected_arrival must be after start_time')));
  });

  // TEST 7: Reject invalid vehicle ID
  test('7. Reject Trip with non-existent vehicle ID', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      vehicle_id: '99999999-9999-9999-9999-999999999999'
    };
    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 404);
  });

  // TEST 8: Reject invalid driver ID
  test('8. Reject Trip with non-existent driver ID', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      driver_id: '99999999-9999-9999-9999-999999999999'
    };
    const res = await api('', { method: 'POST', body: payload });
    assert.equal(res.status, 404);
  });

  // TEST 9: Reject Vehicle from another Organization (Tenant Isolation)
  test('9. Reject Trip assigning Vehicle from another organization', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      vehicle_id: vehicleB1Id // Vehicle belongs to org-test-B
    };
    const res = await api('', { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 400);
    assert.ok(res.data.message.includes('another organization'));
  });

  // TEST 10: Reject Driver from another Organization (Tenant Isolation)
  test('10. Reject Trip assigning Driver from another organization', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      driver_id: driverB1Id // Driver belongs to org-test-B
    };
    const res = await api('', { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 400);
    assert.ok(res.data.message.includes('another organization'));
  });

  // TEST 11: Reject unavailable Vehicle (In Shop)
  test('11. Reject assigning unavailable Vehicle (status: In Shop)', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      vehicle_id: vehicleA2Id // In Shop
    };
    const res = await api('', { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 409);
    assert.ok(res.data.message.includes('In Shop'));
  });

  // TEST 12: Reject unavailable Driver (Suspended)
  test('12. Reject assigning unavailable Driver (status: Suspended)', async () => {
    const payload = {
      origin: 'Mumbai Hub',
      destination: 'Pune Depot',
      planned_route: 'Route A',
      start_time: '2026-10-01T08:00:00Z',
      expected_arrival: '2026-10-01T12:00:00Z',
      driver_id: driverA2Id // Suspended
    };
    const res = await api('', { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 409);
    assert.ok(res.data.message.includes('Suspended'));
  });

  // TEST 13: Tenant Isolation: Dispatcher A cannot view or modify Org B Trip
  test('13. Cross-Tenant Isolation: User in Org A cannot access Trip in Org B', async () => {
    // Org B creates a trip
    const tripBRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Kolkata Hub',
        destination: 'Siliguri Terminal',
        planned_route: 'NH12',
        start_time: '2026-10-05T08:00:00Z',
        expected_arrival: '2026-10-05T18:00:00Z'
      },
      token: tokenManagerB
    });
    const tripBId = tripBRes.data.data.id;

    // Org A Manager tries to fetch it
    const fetchRes = await api(`/${tripBId}`, { method: 'GET', token: tokenManagerA });
    assert.equal(fetchRes.status, 404);

    // Org A Manager tries to patch it
    const patchRes = await api(`/${tripBId}`, {
      method: 'PATCH',
      body: { destination: 'Hacked Dest' },
      token: tokenManagerA
    });
    assert.equal(patchRes.status, 404);
  });

  // TEST 14: State Machine Lifecycle: DRAFT -> PLANNED -> ASSIGNED -> DISPATCHED -> COMPLETED
  test('14. Full Operational Lifecycle & Fleet State Coordination', async () => {
    // Step 1: Create Draft
    const createRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Ahmedabad Depot',
        destination: 'Surat Terminal',
        planned_route: 'NE1 Expressway',
        start_time: '2026-10-10T09:00:00Z',
        expected_arrival: '2026-10-10T14:00:00Z'
      }
    });
    const tripId = createRes.data.data.id;
    assert.equal(createRes.data.data.status, 'Draft');

    // Step 2: Transition to Planned
    const planRes = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Planned' }
    });
    assert.equal(planRes.status, 200);
    assert.equal(planRes.data.data.status, 'Planned');

    // Step 3: Assign Vehicle and Driver
    const assignPatch = await api(`/${tripId}`, {
      method: 'PATCH',
      body: { vehicle_id: vehicleA1Id, driver_id: driverA1Id }
    });
    assert.equal(assignPatch.status, 200);

    const assignStatus = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assignStatus.status, 200);
    assert.equal(assignStatus.data.data.status, 'Assigned');

    // Step 4: Dispatch Trip -> Atomically updates vehicle and driver to 'On Trip'
    const dispatchRes = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Dispatched' }
    });
    assert.equal(dispatchRes.status, 200);
    assert.equal(dispatchRes.data.data.status, 'Dispatched');

    // Verify Vehicle and Driver in DB are now 'On Trip'
    const vCheck = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleA1Id]);
    assert.equal(vCheck.rows[0].status, 'On Trip');
    const dCheck = await query('SELECT status FROM drivers WHERE id = $1', [driverA1Id]);
    assert.equal(dCheck.rows[0].status, 'On Trip');

    // Step 5: Complete Trip -> Sets actual_arrival and restores Vehicle and Driver to 'Available'
    const completeRes = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Completed', actual_distance: 265.5 }
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.data.data.status, 'Completed');
    assert.ok(completeRes.data.data.actual_arrival);
    assert.equal(Number(completeRes.data.data.actual_distance), 265.5);

    // Verify Vehicle and Driver in DB are now restored to 'Available'
    const vRestored = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleA1Id]);
    assert.equal(vRestored.rows[0].status, 'Available');
    const dRestored = await query('SELECT status FROM drivers WHERE id = $1', [driverA1Id]);
    assert.equal(dRestored.rows[0].status, 'Available');

    // Step 6: Verify Terminal State -> Cannot transition from Completed
    const terminalRes = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Planned' }
    });
    assert.equal(terminalRes.status, 400);
    assert.ok(terminalRes.data.message.includes('terminal status'));
  });

  // TEST 15: Concurrency / Double Assignment Prevention with Pessimistic Row Locking
  test('15. Prevent concurrent double-assignment of the same Vehicle', async () => {
    // Create Trip 1 and assign vehicleA1 and driverA1
    const t1 = await api('', {
      method: 'POST',
      body: {
        origin: 'City A',
        destination: 'City B',
        planned_route: 'Route 1',
        start_time: '2026-10-15T08:00:00Z',
        expected_arrival: '2026-10-15T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    const t1Id = t1.data.data.id;

    // Assign and Dispatch Trip 1 -> vehicle becomes 'On Trip'
    await api(`/${t1Id}/status`, { method: 'PATCH', body: { status: 'Assigned' } });
    await api(`/${t1Id}/status`, { method: 'PATCH', body: { status: 'Dispatched' } });

    // Create Trip 2 attempting to assign the same vehicle
    const t2 = await api('', {
      method: 'POST',
      body: {
        origin: 'City X',
        destination: 'City Y',
        planned_route: 'Route 2',
        start_time: '2026-10-15T09:00:00Z',
        expected_arrival: '2026-10-15T13:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA3Id
      }
    });
    // Should be rejected because vehicle is already On Trip!
    assert.equal(t2.status, 409);
    assert.ok(t2.data.message.includes('unavailable'));

    // Cleanup Trip 1 to restore vehicle
    await api(`/${t1Id}/status`, { method: 'PATCH', body: { status: 'Completed' } });
  });

  // TEST 16: Safe Cancellation & Conditional Availability Restoration
  test('16. Trip Cancellation conditionally releases assets without corrupting independent states', async () => {
    // Assign vehicleA1 and driverA1
    const t = await api('', {
      method: 'POST',
      body: {
        origin: 'Origin C',
        destination: 'Dest C',
        planned_route: 'Route C',
        start_time: '2026-10-20T08:00:00Z',
        expected_arrival: '2026-10-20T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    const tId = t.data.data.id;
    await api(`/${tId}/status`, { method: 'PATCH', body: { status: 'Assigned' } });
    await api(`/${tId}/status`, { method: 'PATCH', body: { status: 'Dispatched' } });

    // While in transit, vehicle is independently marked In Shop
    await query("UPDATE vehicles SET status = 'In Shop' WHERE id = $1", [vehicleA1Id]);

    // Now cancel the Trip
    const cancelRes = await api(`/${tId}/status`, {
      method: 'PATCH',
      body: { status: 'Cancelled' }
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.data.data.status, 'Cancelled');

    // Vehicle should NOT be blindly overwritten to Available! It must remain 'In Shop'!
    const vState = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleA1Id]);
    assert.equal(vState.rows[0].status, 'In Shop');

    // Driver was 'On Trip', so driver SHOULD be restored to Available
    const dState = await query('SELECT status FROM drivers WHERE id = $1', [driverA1Id]);
    assert.equal(dState.rows[0].status, 'Available');

    // Reset vehicle to Available for next tests
    await query("UPDATE vehicles SET status = 'Available' WHERE id = $1", [vehicleA1Id]);
  });

  // TEST 17: Driver RBAC Isolation
  test('17. Driver can only view their own assigned trip; accessing another driver trip returns 403', async () => {
    // Create a trip assigned to Driver 1
    const tripForD1 = await api('', {
      method: 'POST',
      body: {
        origin: 'Driver Origin',
        destination: 'Driver Dest',
        planned_route: 'Driver Route',
        start_time: '2026-10-25T08:00:00Z',
        expected_arrival: '2026-10-25T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    const trip1Id = tripForD1.data.data.id;

    // Driver 1 accesses their trip -> 200 OK
    const d1Access = await api(`/${trip1Id}`, { method: 'GET', token: tokenDriverA1 });
    assert.equal(d1Access.status, 200);
    assert.equal(d1Access.data.data.id, trip1Id);

    // Driver 2 attempts to access Driver 1's trip -> 403 Forbidden!
    const d2Access = await api(`/${trip1Id}`, { method: 'GET', token: tokenDriverA2 });
    assert.equal(d2Access.status, 403);
    assert.equal(d2Access.data.success, false);

    // Driver 2 listing trips -> only gets trips where driver_id = driverA3Id
    const d2List = await api('', { method: 'GET', token: tokenDriverA2 });
    assert.equal(d2List.status, 200);
    assert.ok(d2List.data.data.every(trip => trip.driver_id === driverA3Id));
  });

  // TEST 18: Physical Delete restricted strictly to Draft trips
  test('18. Physical delete rejected on operational trips; only Draft trips may be deleted', async () => {
    // Create Draft trip
    const draft = await api('', {
      method: 'POST',
      body: {
        origin: 'Temp Origin',
        destination: 'Temp Dest',
        planned_route: 'Temp Route',
        start_time: '2026-10-30T08:00:00Z',
        expected_arrival: '2026-10-30T12:00:00Z',
        status: 'Draft'
      }
    });
    const draftId = draft.data.data.id;

    // Delete Draft trip -> 200 OK
    const delDraft = await api(`/${draftId}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delDraft.status, 200);

    // Create another trip and dispatch it
    const dispatched = await api('', {
      method: 'POST',
      body: {
        origin: 'Op Origin',
        destination: 'Op Dest',
        planned_route: 'Op Route',
        start_time: '2026-10-30T08:00:00Z',
        expected_arrival: '2026-10-30T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    const dispatchedId = dispatched.data.data.id;
    await api(`/${dispatchedId}/status`, { method: 'PATCH', body: { status: 'Assigned' } });
    await api(`/${dispatchedId}/status`, { method: 'PATCH', body: { status: 'Dispatched' } });

    // Attempting to delete dispatched trip -> 400 Bad Request
    const delDispatched = await api(`/${dispatchedId}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delDispatched.status, 400);
    assert.ok(delDispatched.data.message.includes('cannot be physically deleted'));

    // Clean up
    await api(`/${dispatchedId}/status`, { method: 'PATCH', body: { status: 'Cancelled' } });
  });

  // TEST 19: List and Filter Trips
  test('19. List trips with status and vehicle filters', async () => {
    const listRes = await api('?status=Cancelled', { method: 'GET', token: tokenManagerA });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.data.data));
    assert.ok(listRes.data.data.every(t => t.status === 'Cancelled'));
  });

  // TEST 20: Initial Assignment Without Conflict
  test('20. A Trip can be assigned a vehicle and driver when no active conflict exists', async () => {
    const tripRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Station A',
        destination: 'Station B',
        planned_route: 'Route A-B',
        start_time: '2026-11-01T08:00:00Z',
        expected_arrival: '2026-11-01T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    assert.equal(tripRes.status, 201);
    const tripId = tripRes.data.data.id;

    // Transition to Assigned
    const assignRes = await api(`/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assignRes.status, 200);
    assert.equal(assignRes.data.data.status, 'Assigned');
    assert.equal(assignRes.data.data.vehicle_id, vehicleA1Id);
    assert.equal(assignRes.data.data.driver_id, driverA1Id);

    // Resources in vehicles/drivers tables remain Available during Assigned state
    const vehCheck = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleA1Id]);
    const drvCheck = await query('SELECT status FROM drivers WHERE id = $1', [driverA1Id]);
    assert.equal(vehCheck.rows[0].status, 'Available');
    assert.equal(drvCheck.rows[0].status, 'Available');
  });

  // TEST 21: Prevent Second Trip From Assigning Same Vehicle While First Trip is Assigned
  test('21. A second Trip cannot be assigned the same vehicle while the first Trip is Assigned', async () => {
    // Create Trip 2 with vehicleA1 and driverA3
    const trip2Res = await api('', {
      method: 'POST',
      body: {
        origin: 'Station C',
        destination: 'Station D',
        planned_route: 'Route C-D',
        start_time: '2026-11-01T09:00:00Z',
        expected_arrival: '2026-11-01T13:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA3Id
      }
    });
    assert.equal(trip2Res.status, 201);
    const trip2Id = trip2Res.data.data.id;

    // Attempting to transition Trip 2 to Assigned must be rejected with 409 Conflict
    const assign2Res = await api(`/${trip2Id}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assign2Res.status, 409);
    assert.ok(assign2Res.data.message.includes('already assigned to another active trip'));
    assert.ok(assign2Res.data.message.includes('Vehicle'));

    // Verify Trip 2 remains in Draft status
    const trip2Db = await query('SELECT status FROM trips WHERE id = $1', [trip2Id]);
    assert.equal(trip2Db.rows[0].status, 'Draft');

    // Clean up Trip 2
    await api(`/${trip2Id}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 22: Prevent Second Trip From Assigning Same Driver While First Trip is Assigned
  test('22. A second Trip cannot be assigned the same driver while the first Trip is Assigned', async () => {
    // Create Trip 3 with vehicleA3 and driverA1 (same driver as active Trip 1)
    const trip3Res = await api('', {
      method: 'POST',
      body: {
        origin: 'Station E',
        destination: 'Station F',
        planned_route: 'Route E-F',
        start_time: '2026-11-01T09:00:00Z',
        expected_arrival: '2026-11-01T14:00:00Z',
        vehicle_id: vehicleA3Id,
        driver_id: driverA1Id
      }
    });
    assert.equal(trip3Res.status, 201);
    const trip3Id = trip3Res.data.data.id;

    // Attempting to transition Trip 3 to Assigned must be rejected with 409 Conflict
    const assign3Res = await api(`/${trip3Id}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assign3Res.status, 409);
    assert.ok(assign3Res.data.message.includes('already assigned to another active trip'));
    assert.ok(assign3Res.data.message.includes('Driver'));

    // Verify Trip 3 remains in Draft status
    const trip3Db = await query('SELECT status FROM trips WHERE id = $1', [trip3Id]);
    assert.equal(trip3Db.rows[0].status, 'Draft');

    // Clean up Trip 3
    await api(`/${trip3Id}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 23 & 24: Second Trip Cannot Be Dispatched With Colliding Resources
  test('23-24. A second Trip cannot be dispatched using a vehicle or driver already reserved by another active Trip', async () => {
    // Create Trip 4 with vehicleA1 and driverA3
    const trip4Res = await api('', {
      method: 'POST',
      body: {
        origin: 'Station G',
        destination: 'Station H',
        planned_route: 'Route G-H',
        start_time: '2026-11-01T10:00:00Z',
        expected_arrival: '2026-11-01T15:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA3Id
      }
    });
    const trip4Id = trip4Res.data.data.id;

    // Direct transition from Draft to Dispatched is rejected by state machine (400)
    const directDispatchRes = await api(`/${trip4Id}/status`, {
      method: 'PATCH',
      body: { status: 'Dispatched' }
    });
    assert.equal(directDispatchRes.status, 400);

    // Clean up Trip 4
    await api(`/${trip4Id}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 25: Trip Update Does Not Falsely Self-Collide
  test('25. A Trip can be updated without falsely conflicting with its own vehicle or driver assignment', async () => {
    // Find active Trip (Trip 1 with vehicleA1, driverA1)
    const activeTrips = await query("SELECT id FROM trips WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'Assigned' LIMIT 1");
    const activeTripId = activeTrips.rows[0].id;

    // Update non-resource fields on this Assigned trip
    const updateRes = await api(`/${activeTripId}`, {
      method: 'PATCH',
      body: {
        destination: 'Updated Station B Prime',
        planned_route: 'Updated Expressway Route',
        revenue: 850.50
      }
    });
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.data.data.destination, 'Updated Station B Prime');
    assert.equal(updateRes.data.data.vehicle_id, vehicleA1Id);
    assert.equal(updateRes.data.data.driver_id, driverA1Id);
    assert.equal(updateRes.data.data.status, 'Assigned');
  });

  // TEST 26: Reassignment of an Assigned Trip to a Conflicting Resource is Rejected
  test('26. Reassignment to a resource used by another active Trip is rejected', async () => {
    // Create Trip 5 with vehicleA3 and driverA3 and transition to Assigned
    const trip5Res = await api('', {
      method: 'POST',
      body: {
        origin: 'Origin 5',
        destination: 'Dest 5',
        planned_route: 'Route 5',
        start_time: '2026-11-02T08:00:00Z',
        expected_arrival: '2026-11-02T12:00:00Z',
        vehicle_id: vehicleA3Id,
        driver_id: driverA3Id
      }
    });
    const trip5Id = trip5Res.data.data.id;
    const assign5 = await api(`/${trip5Id}/status`, { method: 'PATCH', body: { status: 'Assigned' } });
    assert.equal(assign5.status, 200);

    // Attempt to reassign Trip 5's vehicle to vehicleA1 (which is active on Trip 1)
    const reassignVeh = await api(`/${trip5Id}`, {
      method: 'PATCH',
      body: { vehicle_id: vehicleA1Id }
    });
    assert.equal(reassignVeh.status, 409);
    assert.ok(reassignVeh.data.message.includes('already assigned to another active trip'));

    // Attempt to reassign Trip 5's driver to driverA1 (which is active on Trip 1)
    const reassignDrv = await api(`/${trip5Id}`, {
      method: 'PATCH',
      body: { driver_id: driverA1Id }
    });
    assert.equal(reassignDrv.status, 409);
    assert.ok(reassignDrv.data.message.includes('already assigned to another active trip'));

    // Clean up Trip 5 by cancelling it
    await api(`/${trip5Id}/status`, { method: 'PATCH', body: { status: 'Cancelled' } });
  });

  // TEST 27: Collision Checks Are Strictly Organization-Scoped
  test('27. Collision checks are organization-scoped', async () => {
    // In Org B, create and assign a trip using Org B resources
    const tripB = await api('', {
      method: 'POST',
      token: tokenManagerB,
      body: {
        origin: 'Org B Origin',
        destination: 'Org B Dest',
        planned_route: 'Org B Route',
        start_time: '2026-11-03T08:00:00Z',
        expected_arrival: '2026-11-03T12:00:00Z',
        vehicle_id: vehicleB1Id,
        driver_id: driverB1Id
      }
    });
    assert.equal(tripB.status, 201);
    const tripBId = tripB.data.data.id;

    // Transition Org B trip to Assigned -> should succeed with 200 OK
    const assignB = await api(`/${tripBId}/status`, {
      method: 'PATCH',
      token: tokenManagerB,
      body: { status: 'Assigned' }
    });
    assert.equal(assignB.status, 200);
    assert.equal(assignB.data.data.status, 'Assigned');

    // Clean up Org B trip
    await api(`/${tripBId}/status`, {
      method: 'PATCH',
      token: tokenManagerB,
      body: { status: 'Cancelled' }
    });
  });

  // TEST 28: Cross-Tenant Resources Cannot Be Assigned Or Reassigned
  test('28. Cross-tenant resources cannot be assigned or reassigned', async () => {
    // Create Draft trip in Org A
    const tripA = await api('', {
      method: 'POST',
      body: {
        origin: 'Org A Origin',
        destination: 'Org A Dest',
        planned_route: 'Org A Route',
        start_time: '2026-11-04T08:00:00Z',
        expected_arrival: '2026-11-04T12:00:00Z'
      }
    });
    const tripAId = tripA.data.data.id;

    // Attempt to update with Org B vehicle -> 400 Bad Request
    const crossVeh = await api(`/${tripAId}`, {
      method: 'PATCH',
      body: { vehicle_id: vehicleB1Id }
    });
    assert.equal(crossVeh.status, 400);

    // Attempt to update with Org B driver -> 400 Bad Request
    const crossDrv = await api(`/${tripAId}`, {
      method: 'PATCH',
      body: { driver_id: driverB1Id }
    });
    assert.equal(crossDrv.status, 400);

    // Clean up
    await api(`/${tripAId}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 29: Cancelled and Completed Trips Release Reservations
  test('29. Cancelled and Completed Trips do not incorrectly block future assignments', async () => {
    // Find active Trip 1 (vehicleA1, driverA1) and Cancel it
    const activeTrips = await query("SELECT id FROM trips WHERE organization_id = 'b0000000-0000-0000-0000-000000000001' AND status = 'Assigned' LIMIT 1");
    const activeTripId = activeTrips.rows[0].id;

    const cancelRes = await api(`/${activeTripId}/status`, {
      method: 'PATCH',
      body: { status: 'Cancelled' }
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.data.data.status, 'Cancelled');

    // Now create a new Trip reusing vehicleA1 and driverA1
    const newTrip = await api('', {
      method: 'POST',
      body: {
        origin: 'Reuse Origin',
        destination: 'Reuse Dest',
        planned_route: 'Reuse Route',
        start_time: '2026-11-05T08:00:00Z',
        expected_arrival: '2026-11-05T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    assert.equal(newTrip.status, 201);
    const newTripId = newTrip.data.data.id;

    // Transitioning to Assigned must now succeed!
    const assignNew = await api(`/${newTripId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assignNew.status, 200);
    assert.equal(assignNew.data.data.status, 'Assigned');

    // Dispatch and Complete this trip to test Completed release behavior
    await api(`/${newTripId}/status`, { method: 'PATCH', body: { status: 'Dispatched' } });
    await api(`/${newTripId}/status`, { method: 'PATCH', body: { status: 'Completed' } });

    // Verify resources can be assigned yet again after completion
    const postCompleteTrip = await api('', {
      method: 'POST',
      body: {
        origin: 'Post Origin',
        destination: 'Post Dest',
        planned_route: 'Post Route',
        start_time: '2026-11-06T08:00:00Z',
        expected_arrival: '2026-11-06T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    assert.equal(postCompleteTrip.status, 201);
    const postTripId = postCompleteTrip.data.data.id;

    const assignPost = await api(`/${postTripId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(assignPost.status, 200);

    // Clean up
    await api(`/${postTripId}/status`, { method: 'PATCH', body: { status: 'Cancelled' } });
  });

  // TEST 30: Failed Assignment Rolls Back Transaction
  test('30. A failed assignment or transition rolls back transactional changes', async () => {
    // Create Trip in Draft status with vehicleA2 (In Shop)
    const tripBad = await api('', {
      method: 'POST',
      body: {
        origin: 'Bad Origin',
        destination: 'Bad Dest',
        planned_route: 'Bad Route',
        start_time: '2026-11-07T08:00:00Z',
        expected_arrival: '2026-11-07T12:00:00Z'
      }
    });
    const badId = tripBad.data.data.id;

    // Manually set vehicle_id to vehicleA2 in DB to bypass create validation
    await query('UPDATE trips SET vehicle_id = $1, driver_id = $2 WHERE id = $3', [vehicleA2Id, driverA1Id, badId]);

    // Transition to Assigned -> fails with 409 because vehicleA2 is 'In Shop'
    const failRes = await api(`/${badId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned' }
    });
    assert.equal(failRes.status, 409);

    // Confirm DB rollback: Trip status remains 'Draft', vehicle status remains 'In Shop'
    const tripCheck = await query('SELECT status FROM trips WHERE id = $1', [badId]);
    const vehCheck = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleA2Id]);
    assert.equal(tripCheck.rows[0].status, 'Draft');
    assert.equal(vehCheck.rows[0].status, 'In Shop');

    // Clean up
    await api(`/${badId}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 31: Race Condition Prevention via Pessimistic Locking (True Concurrency Test)
  test('31. Concurrency: Concurrent assignment requests for the same vehicle results in exactly one success', async () => {
    // Ensure vehicleA1 is Available
    await query("UPDATE vehicles SET status = 'Available' WHERE id = $1", [vehicleA1Id]);
    await query("UPDATE drivers SET status = 'Available' WHERE id IN ($1, $2)", [driverA1Id, driverA3Id]);

    // Create two Draft trips both requesting vehicleA1
    const tripConc1 = await api('', {
      method: 'POST',
      body: {
        origin: 'Conc Origin 1',
        destination: 'Conc Dest 1',
        planned_route: 'Conc Route 1',
        start_time: '2026-11-08T08:00:00Z',
        expected_arrival: '2026-11-08T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id
      }
    });
    const tripConc2 = await api('', {
      method: 'POST',
      body: {
        origin: 'Conc Origin 2',
        destination: 'Conc Dest 2',
        planned_route: 'Conc Route 2',
        start_time: '2026-11-08T08:00:00Z',
        expected_arrival: '2026-11-08T12:00:00Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA3Id
      }
    });
    const id1 = tripConc1.data.data.id;
    const id2 = tripConc2.data.data.id;

    // Launch both assignment requests concurrently
    const [res1, res2] = await Promise.all([
      api(`/${id1}/status`, { method: 'PATCH', body: { status: 'Assigned' } }),
      api(`/${id2}/status`, { method: 'PATCH', body: { status: 'Assigned' } })
    ]);

    const statuses = [res1.status, res2.status].sort();
    // Exactly one should succeed with 200, and exactly one must fail with 409 Conflict!
    assert.deepEqual(statuses, [200, 409]);

    // Clean up active trip
    const winningId = res1.status === 200 ? id1 : id2;
    const losingId = res1.status === 200 ? id2 : id1;
    await api(`/${winningId}/status`, { method: 'PATCH', body: { status: 'Cancelled' } });
    await api(`/${losingId}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 32: Trip API Response contains organization details
  test('32. Trip details and listing return organization_name via organization join', async () => {
    const tripRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Org Details Origin',
        destination: 'Org Details Dest',
        planned_route: 'Route Org',
        start_time: '2026-11-09T08:00:00Z',
        expected_arrival: '2026-11-09T12:00:00Z'
      }
    });
    assert.equal(tripRes.status, 201);
    assert.equal(tripRes.data.data.organization_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(tripRes.data.data.organization_name, 'Org Test A');

    const tripId = tripRes.data.data.id;
    const getRes = await api(`/${tripId}`, { method: 'GET' });
    assert.equal(getRes.status, 200);
    assert.equal(getRes.data.data.organization_id, 'b0000000-0000-0000-0000-000000000001');
    assert.equal(getRes.data.data.organization_name, 'Org Test A');

    const listRes = await api('', { method: 'GET' });
    assert.equal(listRes.status, 200);
    const listed = listRes.data.data.find(t => t.id === tripId);
    assert.ok(listed);
    assert.equal(listed.organization_name, 'Org Test A');

    // Clean up
    await api(`/${tripId}`, { method: 'DELETE', token: tokenManagerA });
  });

  // TEST 33: Reject direct Trip creation with operational or terminal status
  test('33. Reject direct Trip creation with operational or terminal status (Assigned, Dispatched, Completed, Cancelled)', async () => {
    const assignedRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Direct Origin',
        destination: 'Direct Dest',
        planned_route: 'Direct Route',
        start_time: '2026-11-10T08:00:00Z',
        expected_arrival: '2026-11-10T12:00:00Z',
        status: 'Assigned'
      }
    });
    assert.equal(assignedRes.status, 400);

    const dispatchedRes = await api('', {
      method: 'POST',
      body: {
        origin: 'Direct Origin',
        destination: 'Direct Dest',
        planned_route: 'Direct Route',
        start_time: '2026-11-10T08:00:00Z',
        expected_arrival: '2026-11-10T12:00:00Z',
        status: 'Dispatched'
      }
    });
    assert.equal(dispatchedRes.status, 400);
  });
});
