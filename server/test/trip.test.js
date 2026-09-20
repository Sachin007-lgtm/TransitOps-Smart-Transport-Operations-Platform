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
    await query("DELETE FROM trips WHERE organization_id IN ('org-test-A', 'org-test-B')");
    await query("DELETE FROM vehicles WHERE organization_id IN ('org-test-A', 'org-test-B')");
    await query("DELETE FROM drivers WHERE organization_id IN ('org-test-A', 'org-test-B')");

    // 3. Create Org A Vehicles
    const vA1 = await query(`
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, acquisition_cost, status, organization_id)
      VALUES ('TEST-REG-A1', 'Truck Alpha', 'Truck', 5000, 40000, 'Available', 'org-test-A')
      RETURNING id
    `);
    vehicleA1Id = vA1.rows[0].id;

    const vA2 = await query(`
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, acquisition_cost, status, organization_id)
      VALUES ('TEST-REG-A2', 'Truck Broken', 'Truck', 4000, 35000, 'In Shop', 'org-test-A')
      RETURNING id
    `);
    vehicleA2Id = vA2.rows[0].id;

    // 4. Create Org B Vehicle
    const vB1 = await query(`
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, acquisition_cost, status, organization_id)
      VALUES ('TEST-REG-B1', 'Truck Beta', 'Truck', 6000, 50000, 'Available', 'org-test-B')
      RETURNING id
    `);
    vehicleB1Id = vB1.rows[0].id;

    // 5. Create Org A Drivers
    const dA1 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver One', 'LIC-TEST-A1', 'HMV', '2028-01-01', '+919999990001', 'Available', 'org-test-A')
      RETURNING id
    `);
    driverA1Id = dA1.rows[0].id;

    const dA2 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Bad', 'LIC-TEST-A2', 'HMV', '2028-01-01', '+919999990002', 'Suspended', 'org-test-A')
      RETURNING id
    `);
    driverA2Id = dA2.rows[0].id;

    const dA3 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Two', 'LIC-TEST-A3', 'HMV', '2028-01-01', '+919999990003', 'Available', 'org-test-A')
      RETURNING id
    `);
    driverA3Id = dA3.rows[0].id;

    // 6. Create Org B Driver
    const dB1 = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Driver Org B', 'LIC-TEST-B1', 'HMV', '2028-01-01', '+919999990004', 'Available', 'org-test-B')
      RETURNING id
    `);
    driverB1Id = dB1.rows[0].id;

    // 7. Create Tokens
    tokenManagerA = createToken({ id: 101, email: 'managerA@test.com', role: 'Fleet Manager', organization_id: 'org-test-A' });
    tokenDispatcherA = createToken({ id: 102, email: 'dispA@test.com', role: 'Dispatcher', organization_id: 'org-test-A' });
    tokenDriverA1 = createToken({ id: 103, email: 'driver1@test.com', role: 'Driver', driver_id: driverA1Id, organization_id: 'org-test-A' });
    tokenDriverA2 = createToken({ id: 104, email: 'driver2@test.com', role: 'Driver', driver_id: driverA3Id, organization_id: 'org-test-A' });
    tokenManagerB = createToken({ id: 201, email: 'managerB@test.com', role: 'Fleet Manager', organization_id: 'org-test-B' });
  });

  after(async () => {
    // Cleanup test data
    await query("DELETE FROM trips WHERE organization_id IN ('org-test-A', 'org-test-B')");
    await query("DELETE FROM vehicles WHERE organization_id IN ('org-test-A', 'org-test-B')");
    await query("DELETE FROM drivers WHERE organization_id IN ('org-test-A', 'org-test-B')");
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
    assert.equal(res.data.data.organization_id, 'org-test-A');
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
      vehicle_id: 999999
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
      driver_id: 999999
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
});
