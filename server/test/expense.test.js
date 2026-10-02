const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { JWT_SECRET } = require('../src/config/jwt');
const { query, pool } = require('../src/config/db');
const { expenseService } = require('../src/services/expenseService');

// Sign with the SAME secret the app verifies with (src/config/jwt reads
// .env) — a fallback constant here would 401 every request.
function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps Expense Module Backend Tests', () => {
  let server;
  let baseUrl;
  const baseUrlFuels = () => baseUrl.replace('/expenses', '/fuel');

  const orgA = 'e0000000-0000-0000-0000-000000000001';
  const orgB = 'e0000000-0000-0000-0000-000000000002';

  let tokenManagerA;
  let tokenManagerB;
  let vehicleA;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/expenses`;

    tokenManagerA = createToken({ id: null, email: 'mgrA@exp.com', role: 'Owner/Manager', organization_id: orgA });
    tokenManagerB = createToken({ id: null, email: 'mgrB@exp.com', role: 'Owner/Manager', organization_id: orgB });

    // Clean old test records (children before parents)
    await query('DELETE FROM expenses WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM trips WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM vehicles WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgA, orgB]);

    // Parent organizations (slug is NOT NULL), then one vehicle per org
    await query(
      'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3), ($4, $5, $6) ON CONFLICT (id) DO NOTHING',
      [orgA, 'Expense Test Org A', 'expense-test-a', orgB, 'Expense Test Org B', 'expense-test-b']
    );
    const v = await query(
      `INSERT INTO vehicles (organization_id, registration_number, type)
       VALUES ($1, 'RJ-01-EXP-0001', 'Truck'), ($2, 'RJ-02-EXP-0002', 'Truck')
       RETURNING id, organization_id;`,
      [orgA, orgB]
    );
    vehicleA = v.rows.find((r) => r.organization_id === orgA).id;
  });

  after(async () => {
    await query('DELETE FROM expenses WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM trips WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM vehicles WHERE organization_id IN ($1, $2)', [orgA, orgB]);
    await query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgA, orgB]);
    server.close();
    await pool.end();
  });

  const authedRequest = (token, method, path, body) => {
    return new Promise((resolve, reject) => {
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
  };

  test('POST /expenses logs a fuel entry with odometer and litres', async () => {
    const res = await authedRequest(tokenManagerA, 'POST', '/api/expenses', {
      vehicle_id: vehicleA,
      category: 'FUEL',
      description: 'Diesel top-up, Ajmer Road pump',
      amount: 3000,
      quantity: 40,
      odometer: 45200,
      vendor: 'HP Petrol Pump',
      payment_mode: 'UPI'
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.category, 'FUEL');
    assert.equal(Number(res.body.data.odometer), 45200);
    assert.equal(Number(res.body.data.quantity), 40);
    assert.equal(res.body.data.recovered, false);
  });

  test('POST /expenses rejects fuel without an odometer reading', async () => {
    const res = await authedRequest(tokenManagerA, 'POST', '/api/expenses', {
      vehicle_id: vehicleA,
      category: 'FUEL',
      description: 'Diesel, no odometer noted',
      amount: 2500,
      quantity: 35
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /odometer/i);
  });

  test('POST /expenses rejects a zero amount and an unknown category', async () => {
    const zero = await authedRequest(tokenManagerA, 'POST', '/api/expenses', {
      vehicle_id: vehicleA, category: 'OTHER', description: 'zero line', amount: 0
    });
    assert.equal(zero.status, 400);

    const unknown = await authedRequest(tokenManagerA, 'POST', '/api/expenses', {
      vehicle_id: vehicleA, category: 'SNACKS', description: 'not a category', amount: 100
    });
    assert.equal(unknown.status, 400);
  });

  test('POST /expenses blocks a vehicle from another organization', async () => {
    const res = await authedRequest(tokenManagerB, 'POST', '/api/expenses', {
      vehicle_id: vehicleA,
      category: 'MAINTENANCE',
      description: 'cross-tenant attempt',
      amount: 500
    });
    assert.equal(res.status, 404);
  });

  test('POST /fuel forces category=FUEL and still requires the odometer', async () => {
    const fuel = await authedRequest(tokenManagerA, 'POST', '/api/fuel', {
      vehicle_id: vehicleA,
      description: 'Diesel via /fuel alias',
      amount: 2900,
      quantity: 38,
      odometer: 45490
    });
    assert.equal(fuel.status, 201);
    assert.equal(fuel.body.data.category, 'FUEL');

    // A /fuel POST cannot smuggle a different category through.
    const smuggled = await authedRequest(tokenManagerA, 'POST', '/api/fuel', {
      vehicle_id: vehicleA,
      category: 'MAINTENANCE',
      description: 'should be forced to FUEL',
      amount: 100,
      odometer: 45500
    });
    assert.equal(smuggled.status, 201);
    assert.equal(smuggled.body.data.category, 'FUEL');
  });

  test('GET /expenses lists the ledger with km/l on fuel fills', async () => {
    const res = await authedRequest(tokenManagerA, 'GET', '/api/expenses');
    assert.equal(res.status, 200);
    const rows = res.body.data.expenses;
    assert.ok(rows.length >= 3);

    const fills = rows.filter((r) => r.category === 'FUEL' && r.odometer !== null).sort((a, b) => b.odometer - a.odometer);
    // km/l of a fill = distance that tank covered: (this fill's odometer −
    // the previous fill's odometer, newest-first) / litres. Three fills exist
    // (45500 smuggled-alias, 45490, 45200): the chain reads
    //   45500 -> null (nothing before it)
    //   45490 -> (45500−45490)/38 = 0.26
    //   45200 -> (45490−45200)/40 = 7.25
    const byOdo = new Map(fills.map((f) => [Number(f.odometer), f]));
    assert.equal(byOdo.get(45500).km_per_litre, null);
    assert.equal(byOdo.get(45490).km_per_litre, 0.26);
    assert.equal(byOdo.get(45200).km_per_litre, 7.25);
    // Distance travelled since the previous refill rides the same rows.
    assert.equal(byOdo.get(45500).distance_since_prev, null);
    assert.equal(byOdo.get(45490).distance_since_prev, 10);
    assert.equal(byOdo.get(45200).distance_since_prev, 290);
  });

  test('GET /expenses filters by category and recovered status', async () => {
    const fuelOnly = await authedRequest(tokenManagerA, 'GET', '/api/expenses?category=FUEL');
    assert.ok(fuelOnly.body.data.expenses.every((r) => r.category === 'FUEL'));

    const notRecovered = await authedRequest(tokenManagerA, 'GET', '/api/expenses?recovered=false');
    assert.ok(notRecovered.body.data.expenses.every((r) => r.recovered === false));
    assert.equal(notRecovered.body.data.total, fuelOnly.body.data.total);
  });

  test('PATCH /expenses edits an unrecovered entry; amount stays editable', async () => {
    const list = await authedRequest(tokenManagerA, 'GET', '/api/expenses?category=FUEL');
    const target = list.body.data.expenses.find((r) => r.description === 'Diesel via /fuel alias');
    const res = await authedRequest(tokenManagerA, 'PATCH', `/api/expenses/${target.id}`, {
      description: 'Diesel via /fuel alias (corrected)',
      amount: 2950
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.amount, '2950.00');
  });

  test('GET /expenses/summary/vehicles returns per-vehicle cost split', async () => {
    const res = await authedRequest(tokenManagerA, 'GET', '/api/expenses/summary/vehicles');
    assert.equal(res.status, 200);
    const row = res.body.data.summary.find((s) => s.vehicle_id === vehicleA);
    assert.ok(row);
    assert.equal(Number(row.total_cost), Number(row.fuel_cost) + Number(row.maintenance_cost) + Number(row.other_cost));
    assert.ok(Number(row.fuel_cost) > 0);
    assert.ok(Number(row.total_litres) > 0);
    assert.equal(Number(row.last_odometer), 45500);
  });

  test('DELETE /expenses removes an unrecovered entry', async () => {
    const list = await authedRequest(tokenManagerA, 'GET', '/api/expenses');
    const before = list.body.data.total;
    const target = list.body.data.expenses[0];
    const res = await authedRequest(tokenManagerA, 'DELETE', `/api/expenses/${target.id}`);
    assert.equal(res.status, 200);
    const afterList = await authedRequest(tokenManagerA, 'GET', '/api/expenses');
    assert.equal(afterList.body.data.total, before - 1);
  });
});
