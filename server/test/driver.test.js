const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps Driver Module Backend Tests', () => {
  let server;
  let baseUrl;
  let tripsBaseUrl;

  const orgA = 'org-drv-test-A';
  const orgB = 'org-drv-test-B';

  let tokenManagerA;
  let tokenManagerB;

  let driverA1Id;
  let driverB1Id;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/drivers`;
    tripsBaseUrl = `http://127.0.0.1:${port}/api/trips`;

    tokenManagerA = createToken({ id: 901, email: 'mgrA@drv.com', role: 'Fleet Manager', organization_id: orgA });
    tokenManagerB = createToken({ id: 902, email: 'mgrB@drv.com', role: 'Fleet Manager', organization_id: orgB });

    // Clean any prior records
    await query("DELETE FROM trips WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM drivers WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM vehicles WHERE organization_id IN ($1, $2)", [orgA, orgB]);
    await query("DELETE FROM organizations WHERE id IN ($1, $2)", [orgA, orgB]);

    // Seed test organizations
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Driver Test Org A', 'drv-org-a', 'Active'),
             ($2, 'Driver Test Org B', 'drv-org-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [orgA, orgB]);
  });

  after(async () => {
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

  test('1. Reject unauthenticated driver requests with 401', async () => {
    const res = await api(baseUrl, { method: 'GET', token: null });
    assert.equal(res.status, 401);
    assert.equal(res.data.success, false);
  });

  test('2. Reject driver creation when required fields are missing or invalid', async () => {
    const res = await api(baseUrl, {
      method: 'POST',
      body: { name: 'Incomplete Driver' },
      token: tokenManagerA
    });
    assert.equal(res.status, 400);
    assert.ok(res.data.errors && res.data.errors.length > 0);
  });

  test('3. Reject driver creation with expired license when initial status is Available', async () => {
    const res = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Expired License Driver',
        license_number: 'DL-EXP-0001',
        license_category: 'LMV',
        license_expiry_date: '2020-01-01',
        contact_number: '+919876500001',
        status: 'Available'
      },
      token: tokenManagerA
    });
    assert.equal(res.status, 400);
    assert.ok((res.data.message || res.data.error).includes('expired'));
  });

  test('4. Successfully create valid driver with 201', async () => {
    const res = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Ramesh Kumar',
        license_number: 'DL-MH-20250001',
        license_category: 'LMV',
        license_expiry_date: '2028-12-31',
        contact_number: '+919876543210',
        status: 'Available',
        safety_score: 95
      },
      token: tokenManagerA
    });
    assert.equal(res.status, 201);
    assert.equal(res.data.success, true);
    assert.equal(res.data.data.name, 'Ramesh Kumar');
    assert.equal(res.data.data.license_number, 'DL-MH-20250001');
    assert.equal(res.data.data.status, 'Available');
    assert.equal(res.data.data.organization_id, orgA);
    driverA1Id = res.data.data.id;
  });

  test('5. Reject creating driver with duplicate license number (409 Conflict)', async () => {
    const res = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Duplicate License Person',
        license_number: 'DL-MH-20250001',
        license_category: 'LMV',
        license_expiry_date: '2029-01-01',
        contact_number: '+919876543211',
        status: 'Available'
      },
      token: tokenManagerA
    });
    assert.equal(res.status, 409);
    assert.equal(res.data.success, false);
  });

  test('6. Org B creates driver; Org A cannot read, update, or delete Org B driver (404)', async () => {
    const bRes = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Suresh Org B',
        license_number: 'DL-KA-20250002',
        license_category: 'HMV',
        license_expiry_date: '2028-10-15',
        contact_number: '+919123456780',
        status: 'Available'
      },
      token: tokenManagerB
    });
    assert.equal(bRes.status, 201);
    driverB1Id = bRes.data.data.id;

    // Org A cannot fetch Org B driver
    const getRes = await api(`${baseUrl}/${driverB1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(getRes.status, 404);

    // Org A cannot update Org B driver
    const putRes = await api(`${baseUrl}/${driverB1Id}`, {
      method: 'PUT',
      body: { name: 'Hijacked' },
      token: tokenManagerA
    });
    assert.equal(putRes.status, 404);

    // Org A cannot delete Org B driver
    const delRes = await api(`${baseUrl}/${driverB1Id}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delRes.status, 404);
  });

  test('7. List drivers strictly returns only tenant drivers with dynamic trips_count', async () => {
    const res = await api(baseUrl, { method: 'GET', token: tokenManagerA });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.every(d => d.organization_id === orgA));
    assert.ok(!res.data.data.some(d => d.id === driverB1Id));
    assert.equal(res.data.data[0].trips_count, 0);
  });

  test('8. Update driver profile via PUT /api/drivers/:id', async () => {
    const res = await api(`${baseUrl}/${driverA1Id}`, {
      method: 'PUT',
      body: {
        name: 'Ramesh K. Sharma',
        safety_score: 98
      },
      token: tokenManagerA
    });
    assert.equal(res.status, 200);
    assert.equal(res.data.data.name, 'Ramesh K. Sharma');
    assert.equal(Number(res.data.data.safety_score), 98);
  });

  test('9. Update driver status via PATCH /api/drivers/:id/status', async () => {
    const patchRes = await api(`${baseUrl}/${driverA1Id}/status`, {
      method: 'PATCH',
      body: { status: 'Off Duty' },
      token: tokenManagerA
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.data.data.status, 'Off Duty');

    // Restore to Available
    const restoreRes = await api(`${baseUrl}/${driverA1Id}/status`, {
      method: 'PATCH',
      body: { status: 'Available' },
      token: tokenManagerA
    });
    assert.equal(restoreRes.status, 200);
    assert.equal(restoreRes.data.data.status, 'Available');
  });

  test('10. Reject setting driver status to Available if license is expired', async () => {
    // Create an Off Duty driver with expired license
    const expRes = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Dinesh Expired',
        license_number: 'DL-EXP-202100',
        license_category: 'LMV',
        license_expiry_date: '2021-01-01',
        contact_number: '+919988776655',
        status: 'Off Duty'
      },
      token: tokenManagerA
    });
    assert.equal(expRes.status, 201);
    const expId = expRes.data.data.id;

    // Attempting to set to Available must fail with 400
    const patchFail = await api(`${baseUrl}/${expId}/status`, {
      method: 'PATCH',
      body: { status: 'Available' },
      token: tokenManagerA
    });
    assert.equal(patchFail.status, 400);
    assert.ok((patchFail.data.message || patchFail.data.error).includes('expired'));
  });

  test('11. Trips module rejects assigning a driver with an expired license', async () => {
    // Seed vehicle for Org A
    const vRes = await query(`
      INSERT INTO vehicles (name, registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('Van A', 'MH-01-DRV-1', 'Van', 1000, 'Available', $1)
      RETURNING id
    `, [orgA]);
    const vId = vRes.rows[0].id;

    // Create a driver with expired license in Suspended status
    const dExp = await query(`
      INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
      VALUES ('Old Driver', 'DL-OLD-1999', 'LMV', '2020-05-01', '+919876543200', 'Available', $1)
      RETURNING id
    `, [orgA]);
    const dExpId = dExp.rows[0].id;

    const now = new Date();
    const startTime = new Date(now.getTime() + 1800000).toISOString();
    const expectedArrival = new Date(now.getTime() + 7200000).toISOString();

    const tripRes = await api(tripsBaseUrl, {
      method: 'POST',
      body: {
        origin: 'Mumbai Hub',
        destination: 'Pune Depot',
        planned_route: 'Mumbai -> Pune',
        start_time: startTime,
        expected_arrival: expectedArrival,
        status: 'Draft',
        vehicle_id: vId,
        driver_id: dExpId
      },
      token: tokenManagerA
    });

    assert.equal(tripRes.status, 400);
    assert.ok((tripRes.data.message || tripRes.data.error).includes('expired'));
  });

  test('12. Trip completion dynamically increments driver trips_count', async () => {
    // Get fresh vehicle for trip
    const vRes = await query(`
      INSERT INTO vehicles (name, registration_number, type, max_load_capacity, status, organization_id)
      VALUES ('Van A2', 'MH-01-DRV-2', 'Van', 1000, 'Available', $1)
      RETURNING id
    `, [orgA]);
    const vId = vRes.rows[0].id;

    const now = new Date();
    const startTime = new Date(now.getTime() + 1800000).toISOString();
    const expectedArrival = new Date(now.getTime() + 7200000).toISOString();

    // Create Draft trip with driverA1Id
    const tCreate = await api(tripsBaseUrl, {
      method: 'POST',
      body: {
        origin: 'Mumbai Central',
        destination: 'Thane West',
        planned_route: 'Mumbai -> Thane',
        start_time: startTime,
        expected_arrival: expectedArrival,
        status: 'Draft',
        vehicle_id: vId,
        driver_id: driverA1Id,
        planned_distance: 35
      },
      token: tokenManagerA
    });
    assert.equal(tCreate.status, 201);
    const tripId = tCreate.data.data.id;

    // Advance: Draft -> Assigned
    const tAssign = await api(`${tripsBaseUrl}/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Assigned', vehicle_id: vId, driver_id: driverA1Id },
      token: tokenManagerA
    });
    assert.equal(tAssign.status, 200);

    // Advance: Assigned -> Dispatched
    const tDispatch = await api(`${tripsBaseUrl}/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Dispatched' },
      token: tokenManagerA
    });
    assert.equal(tDispatch.status, 200);

    // Driver should now be 'On Trip'
    const drvCheck = await api(`${baseUrl}/${driverA1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(drvCheck.data.data.status, 'On Trip');

    // Reject deleting driver while 'On Trip'
    const delAttempt = await api(`${baseUrl}/${driverA1Id}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delAttempt.status, 400);

    // Advance: Dispatched -> Completed
    const tComplete = await api(`${tripsBaseUrl}/${tripId}/status`, {
      method: 'PATCH',
      body: { status: 'Completed', actual_distance: 36 },
      token: tokenManagerA
    });
    assert.equal(tComplete.status, 200);

    // Driver should be restored to Available and trips_count incremented to 1
    const drvAfter = await api(`${baseUrl}/${driverA1Id}`, { method: 'GET', token: tokenManagerA });
    assert.equal(drvAfter.data.data.status, 'Available');
    assert.equal(drvAfter.data.data.trips_count, 1);
  });

  test('13. Delete driver successfully when idle and not on active trip', async () => {
    // Create an idle driver with no trips
    const tempRes = await api(baseUrl, {
      method: 'POST',
      body: {
        name: 'Idle Driver',
        license_number: 'DL-TEMP-999',
        license_category: 'LMV',
        license_expiry_date: '2028-05-01',
        contact_number: '+919876540000',
        status: 'Available'
      },
      token: tokenManagerA
    });
    assert.equal(tempRes.status, 201);
    const tempId = tempRes.data.data.id;

    // Delete idle driver
    const delRes = await api(`${baseUrl}/${tempId}`, { method: 'DELETE', token: tokenManagerA });
    assert.equal(delRes.status, 200);

    // Confirm 404
    const getRes = await api(`${baseUrl}/${tempId}`, { method: 'GET', token: tokenManagerA });
    assert.equal(getRes.status, 404);
  });
});
