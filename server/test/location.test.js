const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps GPS & Vehicle Locations Backend Tests', { timeout: 60000 }, () => {
  let server;
  let baseUrl;
  let tripsBaseUrl;

  const orgA = 'org-loc-test-A';
  const orgB = 'org-loc-test-B';

  let tokenManagerA;
  let tokenDriverA1;
  let tokenDriverA2;
  let tokenDriverB;

  let vehicleAId;
  let driverA1Id;
  let driverA2Id;
  let tripAId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/locations`;
    tripsBaseUrl = `http://127.0.0.1:${port}/api/trips`;

    // Ensure organizations exist
    await query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [orgA, 'Org Loc A', 'org-loc-a']);
    await query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [orgB, 'Org Loc B', 'org-loc-b']);

    // Clean prior records
    await query('DELETE FROM vehicle_locations WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM trips WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM users WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM drivers WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM vehicles WHERE organization_id IN ($1, $2)', [orgA, orgB]);

    // Create vehicle in orgA
    const vehRes = await query(`
      INSERT INTO vehicles (registration_number, name, type, max_load_capacity, acquisition_cost, status, organization_id)
      VALUES ('MH-LOC-01', 'GPS Fleet Van', 'Van', 2500, 30000, 'Available', $1)
      RETURNING id
    `, [orgA]);
    vehicleAId = vehRes.rows[0].id;

    // Create driver 1 in orgA
    const drv1Res = await query(`
      INSERT INTO drivers (name, contact_number, license_number, license_category, license_expiry_date, status, organization_id)
      VALUES ('Driver One', '1111111111', 'DL-LOC-001', 'Van', '2030-01-01', 'Available', $1)
      RETURNING id
    `, [orgA]);
    driverA1Id = drv1Res.rows[0].id;

    // Create driver 2 in orgA
    const drv2Res = await query(`
      INSERT INTO drivers (name, contact_number, license_number, license_category, license_expiry_date, status, organization_id)
      VALUES ('Driver Two', '2222222222', 'DL-LOC-002', 'Van', '2030-01-01', 'Available', $1)
      RETURNING id
    `, [orgA]);
    driverA2Id = drv2Res.rows[0].id;

    // Create trip in orgA (Assigned status)
    const tripRes = await query(`
      INSERT INTO trips (
        origin, destination, planned_route, vehicle_id, driver_id, cargo_weight, planned_distance, status,
        start_time, expected_arrival, organization_id
      ) VALUES (
        'Depot A', 'Terminal B', 'Direct Highway 1', $1, $2, 1000, 25.5, 'Assigned',
        NOW(), NOW() + INTERVAL '2 hours', $3
      ) RETURNING id
    `, [vehicleAId, driverA1Id, orgA]);
    tripAId = tripRes.rows[0].id;

    tokenManagerA = createToken({ id: 801, email: 'mgrA@loctest.com', role: 'Fleet Manager', organization_id: orgA });
    tokenDriverA1 = createToken({ id: 802, email: 'driver1@loctest.com', role: 'Driver', driver_id: driverA1Id, organization_id: orgA });
    tokenDriverA2 = createToken({ id: 803, email: 'driver2@loctest.com', role: 'Driver', driver_id: driverA2Id, organization_id: orgA });
    tokenDriverB = createToken({ id: 804, email: 'driverB@loctest.com', role: 'Driver', driver_id: 9999, organization_id: orgB });
  });

  after(async () => {
    await query('DELETE FROM vehicle_locations WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM trips WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM users WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM drivers WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM vehicles WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgA, orgB]);
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
    await pool.end();
  });

  test('1. Reject unauthenticated location request with 401', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trip_id: tripAId, latitude: 19.0760, longitude: 72.8777 })
    });
    assert.equal(res.status, 401);
  });

  test('2. Reject location recording when trip is not yet Dispatched (currently Assigned)', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({ trip_id: tripAId, latitude: 19.0760, longitude: 72.8777 })
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message.includes('Dispatched'));
  });

  test('3. Driver A1 starts trip: transitions from Assigned -> Dispatched', async () => {
    const res = await fetch(`${tripsBaseUrl}/${tripAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({ status: 'Dispatched' })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, 'Dispatched');
  });

  test('4. Driver A2 (different driver) is rejected with 403 when trying to record location for Trip A', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA2}`
      },
      body: JSON.stringify({ trip_id: tripAId, latitude: 19.0760, longitude: 72.8777 })
    });
    assert.equal(res.status, 403);
  });

  test('5. Driver B (different tenant org) is rejected with 404 when trying to record location for Trip A', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverB}`
      },
      body: JSON.stringify({ trip_id: tripAId, latitude: 19.0760, longitude: 72.8777 })
    });
    assert.equal(res.status, 404);
  });

  test('6. Assigned Driver A1 records valid GPS location points (201 Created)', async () => {
    const pt1 = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        latitude: 19.0760,
        longitude: 72.8777,
        speed: 35.5,
        heading: 90,
        accuracy: 5.2,
        altitude: 14.0,
        captured_at: new Date(Date.now() - 10000).toISOString()
      })
    });
    assert.equal(pt1.status, 201);
    const body1 = await pt1.json();
    assert.equal(body1.success, true);
    assert.equal(body1.data.trip_id, tripAId);
    assert.equal(body1.data.vehicle_id, vehicleAId);
    assert.equal(body1.data.driver_id, driverA1Id);

    // Second point 5 seconds later
    const pt2 = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        latitude: 19.0800,
        longitude: 72.8800,
        speed: 40.0,
        heading: 95,
        accuracy: 4.8,
        captured_at: new Date().toISOString()
      })
    });
    assert.equal(pt2.status, 201);
  });

  test('7. Rejects malformed or stale GPS timestamps', async () => {
    const malformed = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        latitude: 19.081,
        longitude: 72.881,
        captured_at: 'not-a-timestamp'
      })
    });
    assert.equal(malformed.status, 400);

    const stale = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        latitude: 19.081,
        longitude: 72.881,
        captured_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      })
    });
    assert.equal(stale.status, 400);
  });

  test('8. Rejects impossible GPS accuracy, speed, and heading values', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        latitude: 19.081,
        longitude: 72.881,
        accuracy: 1001,
        speed: -1,
        heading: 361
      })
    });
    assert.equal(res.status, 400);
  });

  test('9. Fleet Manager queries active locations via GET /api/locations/active', async () => {
    const res = await fetch(`${baseUrl}/active`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    const active = body.data.find(t => t.trip_id === tripAId);
    assert.ok(active, 'Active dispatched trip should be present');
    assert.equal(active.vehicle_registration, 'MH-LOC-01');
    assert.equal(active.driver_name, 'Driver One');
    assert.equal(Number(active.latitude).toFixed(4), '19.0800');
    assert.equal(Number(active.longitude).toFixed(4), '72.8800');
  });

  test('10. Retrieve trip breadcrumb history via GET /api/locations/trip/:tripId', async () => {
    const res = await fetch(`${baseUrl}/trip/${tripAId}`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.length, 2);
    assert.equal(Number(body.data[0].latitude).toFixed(4), '19.0760');
    assert.equal(Number(body.data[1].latitude).toFixed(4), '19.0800');
  });

  test('11. Driver A1 completes trip (Dispatched -> Completed)', async () => {
    const res = await fetch(`${tripsBaseUrl}/${tripAId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({ status: 'Completed', actual_distance: 26.2 })
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.status, 'Completed');
  });

  test('12. Location recording is rejected after trip is Completed', async () => {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({ trip_id: tripAId, latitude: 19.0850, longitude: 72.8850 })
    });
    assert.equal(res.status, 400);
  });
});
