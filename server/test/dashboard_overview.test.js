const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('Dashboard Analytics & Overview API Tests', () => {
  let server;
  let baseUrl;
  const orgId = 'e0000000-0000-0000-0000-000000000099';
  const managerToken = createToken({
    id: 'u0000000-0000-0000-0000-000000000077',
    name: 'Sachin Singh',
    email: 'sachin@transitops.test',
    role: 'Owner/Manager',
    organization_id: orgId
  });

  before(async () => {
    await query('BEGIN');
    await query(
      `INSERT INTO organizations (id, name, slug, status) 
       VALUES ($1, 'Dashboard Test Org', 'dashboard-test-org', 'Active') 
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
    await query('DELETE FROM organizations WHERE id = $1', [orgId]);
  });

  test('1. Rejects unauthenticated request with 401', async () => {
    const res = await fetch(`${baseUrl}/reports/dashboard`);
    assert.equal(res.status, 401);
  });

  test('2. Returns full aggregated dashboard metrics with authenticated token', async () => {
    const res = await fetch(`${baseUrl}/reports/dashboard`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data);

    // Verify key sections
    const { overview, kpis, chartData, fuelBreakdown, paymentsToCollect, topVehicles, primaryTrip, attentionItems } = body.data;

    assert.ok(overview);
    assert.ok(kpis.revenue);
    assert.ok(kpis.fuel);
    assert.ok(kpis.tripsCompleted);
    assert.ok(kpis.distanceCovered);
    assert.ok(Array.isArray(chartData));
    assert.equal(chartData.length, 30);
    assert.ok(fuelBreakdown);
    assert.ok(paymentsToCollect);
    assert.ok(topVehicles);
    assert.ok('primaryTrip' in body.data);
    assert.ok(Array.isArray(attentionItems));
  });
});
