const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const Vehicle = require('../src/models/vehicleModel');
const { tripService } = require('../src/services/tripService');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps Vehicle Module Backend Tests', () => {
  let server;
  let baseUrl;
  let tripsBaseUrl;

  const orgA = 'c0000000-0000-0000-0000-000000000001';
  const orgB = 'c0000000-0000-0000-0000-000000000002';

  let tokenManagerA;
  let tokenManagerB;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/vehicles`;
    tripsBaseUrl = `http://127.0.0.1:${port}/api/trips`;

    tokenManagerA = createToken({ id: '80000000-0000-0000-0000-000000000801', email: 'mgrA@veh.com', role: 'Owner/Manager', organization_id: orgA });
    tokenManagerB = createToken({ id: '80000000-0000-0000-0000-000000000802', email: 'mgrB@veh.com', role: 'Owner/Manager', organization_id: orgB });

    // Clean old test records
    await query("DELETE FROM users WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [orgA, orgB]);

    // Seed test organizations
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Vehicle Test Org A', 'veh-org-a', 'Active'),
             ($2, 'Vehicle Test Org B', 'veh-org-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [orgA, orgB]);
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

  // 1. Authentication
  test('1. Reject unauthenticated vehicle requests with 401', async () => {
    const res = await api(baseUrl, { method: 'GET', token: null });
    assert.equal(res.status, 401);
  });

  // 2. Create Vehicle
  let vehicleA1Id;
  test('2. Successfully create vehicle with number plate, type, size and distance', async () => {
    const payload = {
      numberPlate: 'GJ-01-XY-1001',
      type: 'Van',
      size: 'Medium (12ft)',
      distanceCovered: 15400
    };

    const res = await api(baseUrl, { method: 'POST', body: payload, token: tokenManagerA });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    
    const v = res.data.data;
    assert.ok(v.id);
    vehicleA1Id = v.id;
    assert.equal(v.registration_number, 'GJ-01-XY-1001');
    assert.equal(v.number_plate, 'GJ-01-XY-1001');
    assert.equal(v.type, 'Van');
    assert.equal(v.size, 'Medium (12ft)');
    assert.equal(v.status, 'Available');
    assert.equal(Number(v.odometer), 15400);
    assert.equal(Number(v.distance_covered), 15400);
    assert.equal(v.trips_count, 0);
    assert.equal(v.organization_id, orgA);
  });

  // 3. Duplicate Number Plate check
  test('3. Reject creating vehicle with duplicate number plate within same tenant (409 Conflict)', async () => {
    const duplicatePayload = {
      numberPlate: 'gj-01-xy-1001', // case-insensitive check
      type: 'Truck',
      size: 'Heavy (24ft)',
      distanceCovered: 5000
    };

    const res = await api(baseUrl, { method: 'POST', body: duplicatePayload, token: tokenManagerA });
    assert.equal(res.status, 409);
    assert.equal(res.data.success, false);
  });

  // 4. Create Vehicle in Org B
  let vehicleB1Id;
  test('4. Org B creates a vehicle under Org B', async () => {
    const payload = {
      numberPlate: 'MH-02-ZZ-9999',
      type: 'Truck',
      size: 'Heavy (24ft)',
      distanceCovered: 88000
    };

    const res = await api(baseUrl, { method: 'POST', body: payload, token: tokenManagerB });
    assert.equal(res.status, 201);
    vehicleB1Id = res.data.data.id;
    assert.equal(res.data.data.organization_id, orgB);
  });

  // 5. Cross-Tenant Isolation
  test('5. Org A cannot fetch Org B vehicle (returns 404)', async () => {
    const res = await api(`${baseUrl}/${vehicleB1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 404);
  });

  test('6. Org A cannot update Org B vehicle (returns 404)', async () => {
    const res = await api(`${baseUrl}/${vehicleB1Id}`, {
      method: 'PUT',
      body: { distanceCovered: 99999 },
      token: tokenManagerA
    });
    assert.equal(res.status, 404);
  });

  test('7. Org A cannot delete Org B vehicle (returns 404)', async () => {
    const res = await api(`${baseUrl}/${vehicleB1Id}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(res.status, 404);
  });

  // 8. List Vehicles with Tenant Scoping & Filters
  test('8. List vehicles strictly returns only tenant vehicles with dynamic counts', async () => {
    const res = await api(baseUrl, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    
    // Must contain A1 and NOT B1
    const ids = res.data.data.map(v => v.id);
    assert.ok(ids.includes(vehicleA1Id));
    assert.ok(!ids.includes(vehicleB1Id));
  });

  // 9. Update Distance (Odometer)
  test('9. Update vehicle distance covered / odometer reading (200)', async () => {
    const res = await api(`${baseUrl}/${vehicleA1Id}`, {
      method: 'PUT',
      body: { odometer: 16200 },
      token: tokenManagerA
    });
    assert.equal(res.status, 200);
    assert.equal(Number(res.data.data.odometer), 16200);
    assert.equal(Number(res.data.data.distance_covered), 16200);
  });

  // 10. Update Status
  test('10. Update vehicle status to In Shop / Maintenance', async () => {
    const res = await api(`${baseUrl}/${vehicleA1Id}`, {
      method: 'PUT',
      body: { status: 'Maintenance' },
      token: tokenManagerA
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.status, 'In Shop');

    // Restore to Available
    const restoreRes = await api(`${baseUrl}/${vehicleA1Id}`, {
      method: 'PUT',
      body: { status: 'Available' },
      token: tokenManagerA
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.data.status, 'Available');
  });

  // 11. Trips Alignment: Dynamic Trips Count & Lifetime Distance Accumulation
  test('11. Trips completion dynamically updates vehicle trips_count and increments odometer', async () => {
    // Seed an active driver in Org A
    const dRes = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Trip Driver A', 'LIC-TRIP-VEH-1', 'HMV / HGMV', '2028-01-01', '+919877777777', 'Available', $1)
      RETURNING id
    `, [orgA]);
    const driverId = dRes.rows[0].id;

    // Create a trip with vehicleA1Id
    const tripPayload = {
      origin: 'Hub A',
      destination: 'Hub B',
      planned_route: 'Highway 5',
      start_time: '2026-12-01T08:00:00Z',
      expected_arrival: '2026-12-01T12:00:00Z',
      vehicle_id: vehicleA1Id,
      driver_id: driverId
    };

    const tripCreate = await api(tripsBaseUrl, { method: 'POST', body: tripPayload, token: tokenManagerA });
    assert.equal(tripCreate.status, 201);
    const tripId = tripCreate.data.data.id;

    // Advance trip to Assigned -> Dispatched -> Completed
    await api(`${tripsBaseUrl}/${tripId}/status`, { method: 'PATCH', body: { status: 'Assigned' }, token: tokenManagerA });
    await api(`${tripsBaseUrl}/${tripId}/status`, { method: 'PATCH', body: { status: 'Dispatched' }, token: tokenManagerA });

    // Verify vehicle is currently On Trip
    const vehDuringTrip = await api(`${baseUrl}/${vehicleA1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(vehDuringTrip.data.data.status, 'On Trip');

    // Reject deleting vehicle while On Trip
    const delAttempt = await api(`${baseUrl}/${vehicleA1Id}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delAttempt.status, 400);

    // Complete trip with actual_distance = 125 km
    const completeRes = await api(`${tripsBaseUrl}/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Completed', actual_distance: 125 },
      token: tokenManagerA
    });
    assert.equal(completeRes.status, 200);

    // Fetch vehicle and verify:
    // - trips_count incremented from 0 to 1
    // - odometer incremented from 16200 to 16200 + 125 = 16325
    // - status restored to Available
    const vehAfterTrip = await api(`${baseUrl}/${vehicleA1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(vehAfterTrip.status, 200);
    const updatedVeh = vehAfterTrip.data.data;
    assert.equal(updatedVeh.status, 'Available');
    assert.equal(updatedVeh.trips_count, 1);
    assert.equal(updatedVeh.trips_completed, 1);
    assert.equal(Number(updatedVeh.odometer), 16325);
    assert.equal(Number(updatedVeh.distance_covered), 16325);
  });

  // 12. Delete Vehicle
  test('12. Delete vehicle successfully when idle and not on active trip', async () => {
    // Clean completed trip so vehicle has no active dependencies
    await query('DELETE FROM trips WHERE id IN (SELECT id FROM trips WHERE vehicle_id = $1)', [vehicleA1Id]);

    const res = await api(`${baseUrl}/${vehicleA1Id}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);

    const check = await api(`${baseUrl}/${vehicleA1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(check.status, 404);
  });

  // 13. Rejects invalid Indian number plate format
  test('13. Reject invalid number plate formats with HTTP 400', async () => {
    const invalidPlates = ['INVALID123', 'XX-00-00', '12345', 'ABC-DEF-GHI'];
    for (const badPlate of invalidPlates) {
      const res = await api(baseUrl, {
        method: 'POST',
        body: { numberPlate: badPlate, type: 'Van', size: 'Medium (14ft)' },
        token: tokenManagerA
      });
      assert.equal(res.status, 400, `Expected 400 for plate ${badPlate}`);
      assert.equal(res.data.success, false);
    }
  });

  // 14. Normalizes and accepts standard Indian number plates
  test('14. Normalize and accept standard Indian number plates and Bharat series', async () => {
    // Normalizes unformatted standard plate (e.g. KA03MM1234 -> KA-03-MM-1234)
    const res1 = await api(baseUrl, {
      method: 'POST',
      body: { numberPlate: 'ka03mm1234', type: 'Van', size: 'Medium (14ft)' },
      token: tokenManagerA
    });
    assert.equal(res1.status, 201);
    assert.equal(res1.data.data.registration_number, 'KA-03-MM-1234');

    // Normalizes Bharat Series (22BH1234AA -> 22-BH-1234-AA)
    const res2 = await api(baseUrl, {
      method: 'POST',
      body: { numberPlate: '22BH1234AA', type: 'Truck', size: 'Heavy (24ft)' },
      token: tokenManagerA
    });
    assert.equal(res2.status, 201);
    assert.equal(res2.data.data.registration_number, '22-BH-1234-AA');

    // Cleanup created test vehicles
    await query('DELETE FROM vehicles WHERE id IN ($1, $2)', [res1.data.data.id, res2.data.data.id]);
  });

  // 15. Rejects manual transition to 'On Trip'
  test('15. Reject manually setting vehicle status to "On Trip"', async () => {
    // Create a dedicated available vehicle in Org A
    const createRes = await api(baseUrl, {
      method: 'POST',
      body: { numberPlate: 'DL-01-XY-5555', type: 'Truck', size: 'Heavy (24ft)' },
      token: tokenManagerA
    });
    assert.equal(createRes.status, 201);
    const targetVehId = createRes.data.data.id;

    // Attempt to manually PATCH status to 'On Trip'
    const patchRes = await api(`${baseUrl}/${targetVehId}/status`, {
      method: 'PATCH',
      body: { status: 'On Trip' },
      token: tokenManagerA
    });
    assert.equal(patchRes.status, 400);
    assert.equal(patchRes.data.success, false);
    assert.match(patchRes.data.error, /cannot be manually set to "On Trip"/i);

    // Attempt to manually PUT status to 'On trip'
    const putRes = await api(`${baseUrl}/${targetVehId}`, {
      method: 'PUT',
      body: { status: 'On trip' },
      token: tokenManagerA
    });
    assert.equal(putRes.status, 400);
    assert.equal(putRes.data.success, false);

    // Clean up
    await query('DELETE FROM vehicles WHERE id = $1', [targetVehId]);
  });
});
