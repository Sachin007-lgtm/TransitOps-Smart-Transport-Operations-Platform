const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('Trip Scheduled Start Time & Delayed Alerts Tests', () => {
  let server;
  let baseUrl;
  const orgId = 'c0000000-0000-0000-0000-000000000099';
  const managerToken = createToken({
    id: 'u0000000-0000-0000-0000-000000000099',
    email: 'manager@test-scheduled.com',
    role: 'Owner/Manager',
    organization_id: orgId
  });

  before(async () => {
    await query('BEGIN');
    await query(
      `INSERT INTO organizations (id, name, slug, status) 
       VALUES ($1, 'Test Scheduled Org', 'test-scheduled-org', 'Active') 
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );
    await query('COMMIT');

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) await new Promise((res) => server.close(res));
    await query('DELETE FROM trips WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM organizations WHERE id = $1', [orgId]);
  });

  test('1. Trip without scheduled_start_time (legacy trip) does NOT appear in delayed alerts', async () => {
    // Create legacy trip with start_time in the past but scheduled_start_time is null
    const res = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Gandhinagar Depot',
        destination: 'Ahmedabad Hub',
        planned_route: 'Gandhinagar Depot -> Ahmedabad Hub',
        start_time: new Date(Date.now() - 3600000).toISOString(),
        expected_arrival: new Date(Date.now() + 7200000).toISOString()
      })
    });
    assert.strictEqual(res.status, 201);
    const trip = (await res.json()).data;
    assert.strictEqual(trip.scheduled_start_time, null);

    // Fetch delayed alerts
    const alertsRes = await fetch(`${baseUrl}/trips/alerts/delayed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(alertsRes.status, 200);
    const alertsData = (await alertsRes.json()).data;
    assert.strictEqual(alertsData.some(t => t.id === trip.id), false);
  });

  test('2. Trip with scheduled_start_time in the past appears in delayed alerts', async () => {
    const pastTime = new Date(Date.now() - 30 * 60000).toISOString();
    const res = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Gandhinagar Depot',
        destination: 'Vadodara Terminal',
        planned_route: 'Gandhinagar Depot -> Vadodara Terminal',
        scheduled_start_time: pastTime,
        start_time: pastTime,
        expected_arrival: new Date(Date.now() + 7200000).toISOString()
      })
    });
    assert.strictEqual(res.status, 201);
    const trip = (await res.json()).data;
    assert.ok(trip.scheduled_start_time);

    // Fetch delayed alerts
    const alertsRes = await fetch(`${baseUrl}/trips/alerts/delayed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(alertsRes.status, 200);
    const alertsData = (await alertsRes.json()).data;
    const found = alertsData.find(t => t.id === trip.id);
    assert.ok(found, 'Overdue trip must appear in delayed alerts');
    assert.strictEqual(found.status, 'Draft');
  });

  test('3. Trip with scheduled_start_time in the future does NOT appear in delayed alerts', async () => {
    const futureTime = new Date(Date.now() + 2 * 3600000).toISOString();
    const res = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Gandhinagar Depot',
        destination: 'Surat Freight Hub',
        planned_route: 'Gandhinagar Depot -> Surat Freight Hub',
        scheduled_start_time: futureTime,
        start_time: futureTime,
        expected_arrival: new Date(Date.now() + 8 * 3600000).toISOString()
      })
    });
    assert.strictEqual(res.status, 201);
    const trip = (await res.json()).data;

    // Fetch delayed alerts
    const alertsRes = await fetch(`${baseUrl}/trips/alerts/delayed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.strictEqual(alertsRes.status, 200);
    const alertsData = (await alertsRes.json()).data;
    assert.strictEqual(alertsData.some(t => t.id === trip.id), false);
  });

  test('4. When overdue trip starts (status becomes Dispatched/Completed), it leaves delayed alerts', async () => {
    const pastTime = new Date(Date.now() - 45 * 60000).toISOString();
    const res = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Ahmedabad Hub',
        destination: 'Kalol Depot',
        planned_route: 'Ahmedabad Hub -> Kalol Depot',
        scheduled_start_time: pastTime,
        start_time: pastTime,
        expected_arrival: new Date(Date.now() + 7200000).toISOString()
      })
    });
    const trip = (await res.json()).data;

    // Verify it is initially in delayed alerts
    let alertsRes = await fetch(`${baseUrl}/trips/alerts/delayed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    let alertsData = (await alertsRes.json()).data;
    assert.ok(alertsData.some(t => t.id === trip.id));

    // Cancel or complete or dispatch the trip
    const statusRes = await fetch(`${baseUrl}/trips/${trip.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ status: 'Cancelled' })
    });
    assert.strictEqual(statusRes.status, 200);

    // Verify it is no longer in delayed alerts
    alertsRes = await fetch(`${baseUrl}/trips/alerts/delayed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    alertsData = (await alertsRes.json()).data;
    assert.strictEqual(alertsData.some(t => t.id === trip.id), false);
  });
});
