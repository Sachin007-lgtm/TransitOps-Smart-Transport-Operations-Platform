const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config/jwt');
const { query, pool } = require('../src/config/db');

// The mobile driver reports a breakdown from the truck; this suite proves the
// round trip the owner asked about: driver ticket -> manager's web view AND
// the resolved repair's cost landing in the consolidated expense ledger
// (migration 021), so the maintenance page and the ledger agree.

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps maintenance reports -> expense ledger integration', () => {
  let server;
  let baseUrl;

  const ORG = 'f0000000-0000-0000-0000-000000000001';
  const ROLE_MANAGER = '01950000-0000-7000-8000-000000000002';
  const ROLE_DRIVER = '01950000-0000-7000-8000-000000000003';

  let tokenManager;
  let tokenDriver;
  let vehicleId;
  let driverId;
  let tripId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    tokenManager = createToken({ id: null, email: 'int-mgr@test.com', role: 'Owner/Manager', organization_id: ORG });

    // Clean (children first)
    await query('DELETE FROM expenses WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM maintenance_reports WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM trips WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM users WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM drivers WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM vehicles WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM organizations WHERE id = $1', [ORG]);

    await query("INSERT INTO organizations (id, name, slug) VALUES ($1, 'Integration Org', 'integration-org')", [ORG]);
    const v = await query(
      "INSERT INTO vehicles (organization_id, registration_number, type) VALUES ($1, 'RJ-01-INT-0001', 'Truck') RETURNING id",
      [ORG]
    );
    vehicleId = v.rows[0].id;
    const d = await query(
      `INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
       VALUES ('Integration Driver', 'LIC-INT-1', 'HMV / HGMV', '2028-01-01', '+919****0001', 'Available', $1)
       RETURNING id`,
      [ORG]
    );
    driverId = d.rows[0].id;
    const t = await query(
      `INSERT INTO trips (organization_id, origin, destination, planned_route, vehicle_id, driver_id, status, start_time, expected_arrival, revenue)
       VALUES ($1, 'Jaipur', 'Delhi', 'NH48', $2, $3, 'Dispatched', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 hours', 15000)
       RETURNING id`,
      [ORG, vehicleId, driverId]
    );
    tripId = t.rows[0].id;

    // The driver token needs the REAL driver_id (it scopes every report call),
    // so it is minted only after the fixtures exist.
    tokenDriver = createToken({ id: null, email: 'int-driver@test.com', role: 'Driver', organization_id: ORG, driver_id: driverId });
  });

  after(async () => {
    await query('DELETE FROM expenses WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM maintenance_reports WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM trips WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM users WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM drivers WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM vehicles WHERE organization_id = $1', [ORG]);
    await query('DELETE FROM organizations WHERE id = $1', [ORG]);
    server.close();
    await pool.end();
  });

  const api = (token, method, path, body) =>
    new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = require('http').request(
        {
          host: '127.0.0.1',
          port: server.address().port,
          path,
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Length': data ? Buffer.byteLength(data) : 0
          }
        },
        (res) => {
          let raw = '';
          res.on('data', (chunk) => { raw += chunk; });
          res.on('end', () => {
            let parsed = null;
            try { parsed = JSON.parse(raw); } catch { parsed = null; }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      );
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });

  test('driver creates a breakdown ticket from the trip; the manager sees it on the web view', async () => {
    const created = await api(tokenDriver, 'POST', '/api/maintenance/driver-reports', {
      trip_id: tripId,
      description: 'Truck broke down on NH48 — clutch failure',
      priority: 'Critical'
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'Open');
    assert.equal(created.body.data.priority, 'Critical');

    // The manager's web Maintenance page polls this endpoint:
    const managerView = await api(tokenManager, 'GET', '/api/maintenance/driver-reports?view=active');
    assert.equal(managerView.status, 200);
    const row = managerView.body.data.find((r) => r.id === created.body.data.id);
    assert.ok(row, 'the driver ticket must appear in the manager web view');
    assert.equal(row.vehicle_registration, 'RJ-01-INT-0001');
    assert.equal(row.driver_name, 'Integration Driver');
    assert.equal(row.origin, 'Jaipur');
    assert.equal(row.destination, 'Delhi');
    assert.equal(row.repair_cost, null);
  });

  test('completing the trip with an open report flips the vehicle In Shop', async () => {
    // Drivers must pass the loading milestones before completing.
    await api(tokenDriver, 'PATCH', `/api/trips/${tripId}/loading`, { action: 'loaded' });
    await api(tokenDriver, 'PATCH', `/api/trips/${tripId}/loading`, { action: 'unloaded' });

    const completed = await api(tokenDriver, 'PATCH', `/api/trips/${tripId}/status`, { status: 'Completed' });
    assert.equal(completed.status, 200, `complete failed: ${JSON.stringify(completed.body)}`);

    const v = await query('SELECT status, odometer FROM vehicles WHERE id = $1', [vehicleId]);
    assert.equal(v.rows[0].status, 'In Shop');
  });

  test('driver resolves the repair with a cost; the cost lands in the expense ledger', async () => {
    // Driver marks Fixing first (the legal transition)
    const list = await api(tokenDriver, 'GET', '/api/maintenance/driver-reports/trip/' + tripId);
    assert.equal(list.status, 200);
    const report = list.body.data;
    assert.equal(report.status, 'Open');

    const ack = await api(tokenDriver, 'PATCH', `/api/maintenance/driver-reports/${report.id}`, { status: 'Acknowledged' });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.data.status, 'Acknowledged');

    // Resolve with a cost but no receipt photo and not pending -> 400 (bill required)
    const noBill = await api(tokenDriver, 'POST', `/api/maintenance/driver-reports/${report.id}/fix`, {
      repair_cost: 8200, receipt_pending: false
    });
    assert.equal(noBill.status, 400);

    // Resolve with cost + receipt pending -> 200 (the bill photo comes later)
    const resolved = await api(tokenDriver, 'POST', `/api/maintenance/driver-reports/${report.id}/fix`, {
      repair_cost: 8200, receipt_pending: true
    });
    assert.equal(resolved.status, 200, `fix failed: ${JSON.stringify(resolved.body)}`);
    assert.equal(resolved.body.data.status, 'Resolved');
    assert.equal(Number(resolved.body.data.repair_cost), 8200);
    assert.equal(resolved.body.data.receipt_pending, true);

    // The resolved repair's cost must be in the consolidated expense ledger.
    const expenses = await query(
      'SELECT category, description, amount, vehicle_id, trip_id, driver_id FROM expenses WHERE organization_id = $1',
      [ORG]
    );
    assert.equal(expenses.rows.length, 1, 'exactly one expense for the resolved repair');
    const exp = expenses.rows[0];
    assert.equal(exp.category, 'MAINTENANCE');
    assert.equal(Number(exp.amount), 8200);
    assert.equal(exp.vehicle_id, vehicleId);
    assert.equal(exp.trip_id, tripId);
    assert.equal(exp.driver_id, driverId);
  });

  test('vehicle is released after the last report resolves', async () => {
    const v = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleId]);
    assert.equal(v.rows[0].status, 'Available');
  });

  test('the resolved repair shows in the manager web History tab with the cost', async () => {
    const history = await api(tokenManager, 'GET', '/api/maintenance/driver-reports?view=history');
    assert.equal(history.status, 200);
    const row = history.body.data.find((r) => r.repair_cost === '8200.00' || Number(r.repair_cost) === 8200);
    assert.ok(row, 'the resolved repair must appear in the manager web History tab');
    assert.equal(row.status, 'Resolved');
    assert.equal(row.receipt_pending, true);
  });
});
