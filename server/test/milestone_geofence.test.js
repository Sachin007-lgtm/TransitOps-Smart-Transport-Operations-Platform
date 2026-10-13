const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config/jwt');
const { query, pool } = require('../src/config/db');

// Drivers may only mark a trip loaded/unloaded near the pickup/drop-off; managers
// can override with a reason. Trips without coordinates are not enforced.

const ORG = 'd1000000-0000-0000-0000-000000000001';
const CHANDIGARH = [30.7333, 76.7794];
const BHIWADI = [28.2102, 76.8609];

describe('TransitOps load/unload geofence', () => {
  let server;
  let baseUrl;
  let tokenManager;
  let tokenDriver;
  let vehicleId;
  let driverId;
  let geoTripId;
  let plainTripId;

  const call = async (token, method, path, body) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const sendGps = (point, accuracy = 10) =>
    call(tokenDriver, 'POST', '/api/locations', {
      trip_id: geoTripId,
      latitude: point[0],
      longitude: point[1],
      accuracy,
      captured_at: new Date().toISOString()
    });

  const makeTrip = async (coords) => {
    const result = await query(
      `INSERT INTO trips (organization_id, origin, destination, planned_route, vehicle_id, driver_id, status,
                          start_time, expected_arrival, origin_lat, origin_lng, dest_lat, dest_lng)
       VALUES ($1, 'Chandigarh', 'Bhiwadi', 'NH48', $2, $3, 'Dispatched',
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours', $4, $5, $6, $7)
       RETURNING id`,
      [ORG, vehicleId, driverId, ...(coords ? [...CHANDIGARH, ...BHIWADI] : [null, null, null, null])]
    );
    return result.rows[0].id;
  };

  const cleanup = async () => {
    await query('ALTER TABLE vehicle_locations DISABLE TRIGGER trg_prevent_telemetry_delete');
    await query('DELETE FROM vehicle_locations WHERE organization_id = $1', [ORG]);
    await query('ALTER TABLE vehicle_locations ENABLE TRIGGER trg_prevent_telemetry_delete');
    await query('DELETE FROM trips WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM drivers WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM vehicles WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM organizations WHERE id = $1', [ORG]);
  };

  before(async () => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    await cleanup();

    await query("INSERT INTO organizations (id, name, slug) VALUES ($1, 'Geofence Org', 'geofence-org')", [ORG]);
    vehicleId = (await query(
      "INSERT INTO vehicles (organization_id, registration_number, type) VALUES ($1, 'RJ-14-GEO-0001', 'Truck') RETURNING id",
      [ORG]
    )).rows[0].id;
    driverId = (await query(
      `INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
       VALUES ('Geofence Driver', 'LIC-GEO-1', 'HMV / HGMV', '2028-01-01', '+919000000077', 'On Trip', $1) RETURNING id`,
      [ORG]
    )).rows[0].id;

    geoTripId = await makeTrip(true);
    plainTripId = await makeTrip(false);

    const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    tokenManager = sign({ id: null, email: 'geo-mgr@test.com', role: 'Owner/Manager', organization_id: ORG });
    tokenDriver = sign({ id: null, email: 'geo-driver@test.com', role: 'Driver', organization_id: ORG, driver_id: driverId });
  });

  after(async () => {
    await cleanup();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  });

  test('driver cannot load without a recent GPS location', async () => {
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'loaded' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /No recent GPS location/);
  });

  test('driver far from the pickup cannot load', async () => {
    assert.equal((await sendGps(BHIWADI)).status, 201);
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'loaded' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /from the pickup point/);
  });

  test('driver with a weak GPS signal is rejected', async () => {
    assert.equal((await sendGps(CHANDIGARH, 800)).status, 201);
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'loaded' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /GPS signal is too weak/);
  });

  test('driver near the pickup can load, and the position is recorded', async () => {
    assert.equal((await sendGps([CHANDIGARH[0] + 0.01, CHANDIGARH[1]])).status, 201);
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'loaded' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.loaded_at);

    const events = await query('SELECT source, distance_m FROM trip_milestone_events WHERE trip_id = $1', [geoTripId]);
    assert.equal(events.rows.length, 1);
    assert.equal(events.rows[0].source, 'driver');
    assert.ok(events.rows[0].distance_m < 3000);
  });

  test('driver far from the drop-off cannot unload', async () => {
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'unloaded' });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /from the drop-off point/);
  });

  test('a manager override needs a reason and is recorded', async () => {
    const noReason = await call(tokenManager, 'PATCH', `/api/trips/${geoTripId}/loading`, { action: 'unloaded' });
    assert.equal(noReason.status, 400);

    const overridden = await call(tokenManager, 'PATCH', `/api/trips/${geoTripId}/loading`, {
      action: 'unloaded',
      override_reason: 'Driver phone GPS failed at the yard'
    });
    assert.equal(overridden.status, 200, JSON.stringify(overridden.body));
    assert.ok(overridden.body.data.unloaded_at);

    const events = await query(
      "SELECT override_reason FROM trip_milestone_events WHERE trip_id = $1 AND source = 'manager_override'",
      [geoTripId]
    );
    assert.equal(events.rows[0].override_reason, 'Driver phone GPS failed at the yard');
  });

  test('a trip without coordinates is not enforced', async () => {
    const res = await call(tokenDriver, 'PATCH', `/api/trips/${plainTripId}/loading`, { action: 'loaded' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test('coordinates are saved on create and cleared when an address changes without new ones', async () => {
    const invalid = await call(tokenManager, 'POST', '/api/trips', {
      origin: 'A', destination: 'B', planned_route: 'A -> B',
      start_time: new Date(Date.now() + 3600000).toISOString(),
      expected_arrival: new Date(Date.now() + 7200000).toISOString(),
      origin_coords: [123, 10]
    });
    assert.equal(invalid.status, 400);

    const created = await call(tokenManager, 'POST', '/api/trips', {
      origin: 'Chandigarh', destination: 'Bhiwadi', planned_route: 'Chandigarh -> Bhiwadi',
      start_time: new Date(Date.now() + 3600000).toISOString(),
      expected_arrival: new Date(Date.now() + 7200000).toISOString(),
      origin_coords: CHANDIGARH,
      dest_coords: BHIWADI
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const tripId = created.body.data.id;
    assert.equal(created.body.data.origin_lat, CHANDIGARH[0]);
    assert.equal(created.body.data.dest_lng, BHIWADI[1]);

    const edited = await call(tokenManager, 'PATCH', `/api/trips/${tripId}`, { origin: 'Ludhiana' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.data.origin_lat, null);
    assert.equal(edited.body.data.dest_lat, BHIWADI[0]);
  });
});
