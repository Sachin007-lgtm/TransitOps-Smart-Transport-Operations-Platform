// End-to-end API suite for company billing: trips of one company composed
// into a single bill, the ledger (previous balance, advances, payments), the
// printed document, and tenant/RBAC boundaries.
//
// Runs against a real Postgres (see docker-compose.yml) with the app mounted
// on an ephemeral port, in the same style as the other modules' suites.
//
// Fixture note: trips that need to be in a non-Draft status are inserted
// directly, because walking every trip through the full dispatch lifecycle
// (Assigned -> Dispatched -> Completed, with vehicle/driver availability
// juggling) adds noise unrelated to billing. Two tests below do walk the real
// lifecycle over HTTP to prove an API-created, API-completed trip is billed.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const ORG_A = '90000000-0000-0000-0000-0000000000a1';
const ORG_B = '90000000-0000-0000-0000-0000000000a2';
const TEST_ORGS = [ORG_A, ORG_B];

const { hashPassword } = require('../src/utils/credentials');

// dev's authenticate verifies the token against a real user row (active, role
// and organization must match the claims), so every token below belongs to a
// seeded user rather than a synthetic one.
// A Driver account is not just a row: dev's enforce_user_role_invariants trigger
// requires an organization, a linked driver profile AND a phone number (that is
// the mobile login), so driver users pass all three.
const seedUser = async (orgId, roleId, email, name, passwordHash, driverId = null, phone = null) => {
  const res = await query(
    `INSERT INTO users (name, email, phone_number, password_hash, role_id, organization_id, driver_id, must_change_password, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, TRUE)
     RETURNING id`,
    [name, email, phone, passwordHash, roleId, orgId, driverId]
  );
  return res.rows[0].id;
};

const roleIds = async () => {
  const res = await query('SELECT id, name FROM roles');
  const find = (name) => {
    const row = res.rows.find((r) => r.name === name);
    if (!row) throw new Error(`role '${name}' is missing - run the seed before this suite`);
    return row.id;
  };
  return { manager: find('Owner/Manager'), driver: find('Driver') };
};


describe('TransitOps Company Billing Backend Tests', () => {
  let server;
  let baseUrl;

  let tokenManagerA;
  let tokenDriverA;
  let tokenManagerB;

  let vehicleA1Id;
  let vehicleA2Id;
  let driverA1Id;
  let driverA2Id;

  let sharmaCompanyId;
  let guptaCompanyId;

  let lifecycleTripId;
  let sharmaTripL1;
  let sharmaTripL2;
  let sharmaTripT3;
  let guptaTripT4;
  let sharmaTripT5;
  let ampCompanyId;

  let bill1Id;
  let bill1No;
  let bill2Id;
  let bill2No;
  let ampBillId;

  async function call(method, path, { token, body } = {}) {
    // `path` is relative to the billing base URL unless it is already absolute
    // (the trip tests borrow the same helper against /api/trips).
    const url = path.startsWith('http') ? path : baseUrl + path;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null; // the bill download responds with an HTML document
    }
    return { status: res.status, json, text };
  }

  // Direct fixture insert for a trip in an arbitrary status.
  async function seedTrip({
    organization_id = TEST_ORGS[0],
    company_id = null,
    party_name = null,
    revenue = 0,
    advance = 0,
    status = 'Completed',
    origin = 'Manesar',
    destination = 'Ahmedabad',
    trip_date = '2026-09-20'
  }) {
    const result = await query(
      `INSERT INTO trips (
         organization_id, external_party_name, external_party_type,
         origin, destination, planned_route, cargo_weight,
         revenue, start_time, expected_arrival, status,
         company_id, trip_date, advance_received
       ) VALUES (
         $1, $2, 'CUSTOMER', $3, $4, $5, 900,
         $6, $7::date + time '09:00', $7::date + time '14:00', $8,
         $9, $7::date, $10
       ) RETURNING *;`,
      [
        organization_id,
        party_name,
        origin,
        destination,
        `${origin} -> ${destination}`,
        revenue,
        trip_date,
        status,
        company_id,
        advance
      ]
    );
    return result.rows[0];
  }

  before(async () => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api/billing`;
    globalThis.__billingTripsUrl = `http://127.0.0.1:${server.address().port}/api/trips`;

    // Clean any previous run, in dependency order.
    await query(
      `DELETE FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE organization_id = ANY($1::uuid[]))`,
      [TEST_ORGS]
    );
    await query(`DELETE FROM users WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`UPDATE trips SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bills WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM trips WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM companies WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM vehicles WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM drivers WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bill_counters WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [TEST_ORGS]);

    await query(
      `INSERT INTO organizations (id, name, slug, status)
       VALUES ('90000000-0000-0000-0000-0000000000a1', 'Billing Test Org A', 'billing-test-a', 'Active'),
              ('90000000-0000-0000-0000-0000000000a2', 'Billing Test Org B', 'billing-test-b', 'Active')
       ON CONFLICT (id) DO NOTHING;`
    );

    const vA1 = await query(
      `INSERT INTO vehicles (registration_number, type, size, max_load_capacity, odometer, status, organization_id)
       VALUES ('BILL-REG-A1', 'Truck', 'Standard', 5000, 12000, 'Available', '90000000-0000-0000-0000-0000000000a1')
       RETURNING id;`
    );
    vehicleA1Id = vA1.rows[0].id;

    const vA2 = await query(
      `INSERT INTO vehicles (registration_number, type, size, max_load_capacity, odometer, status, organization_id)
       VALUES ('BILL-REG-A2', 'Truck', 'Standard', 5000, 12000, 'Available', '90000000-0000-0000-0000-0000000000a1')
       RETURNING id;`
    );
    vehicleA2Id = vA2.rows[0].id;

    const dA1 = await query(
      `INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
       VALUES ('Billing Driver One', 'LIC-BILL-A1', 'HMV / HGMV', '2030-01-01', '+919000000101', 'Available', '90000000-0000-0000-0000-0000000000a1')
       RETURNING id;`
    );
    driverA1Id = dA1.rows[0].id;

    const dA2 = await query(
      `INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, status, organization_id)
       VALUES ('Billing Driver Two', 'LIC-BILL-A2', 'HMV / HGMV', '2030-01-01', '+919000000102', 'Available', '90000000-0000-0000-0000-0000000000a1')
       RETURNING id;`
    );
    driverA2Id = dA2.rows[0].id;

    const roles = await roleIds();
    const passwordHash = await hashPassword('password123');

    const mgrA = await seedUser(ORG_A, roles.manager, 'billmgrA@test.com', 'Billing Manager A', passwordHash);
    const drvA = await seedUser(ORG_A, roles.driver, null, 'Billing Driver Login A', passwordHash, driverA1Id, '+919876500101');
    const mgrB = await seedUser(ORG_B, roles.manager, 'billmgrB@test.com', 'Billing Manager B', passwordHash);

    // A driver replaces the old Dispatcher/Analyst tokens: dev's role set is
    // exactly Platform Admin / Owner/Manager / Driver, and a driver has no
    // business reading or writing billing.
    tokenManagerA = createToken({ id: mgrA, email: 'billmgrA@test.com', role: 'Owner/Manager', organization_id: ORG_A });
    tokenDriverA = createToken({ id: drvA, email: 'billdrvA@test.com', role: 'Driver', organization_id: ORG_A });
    tokenManagerB = createToken({ id: mgrB, email: 'billmgrB@test.com', role: 'Owner/Manager', organization_id: ORG_B });
  });

  after(async () => {
    await query(`DELETE FROM users WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`UPDATE trips SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bills WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM trips WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM companies WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM vehicles WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM drivers WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bill_counters WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [TEST_ORGS]);
    server.close();
    await pool.end();
  });

  // ---------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------

  test('1. Rejects unauthenticated billing requests with 401', async () => {
    const res = await call('GET', '/companies');
    assert.equal(res.status, 401);
  });

  test('2. A driver may neither read nor write billing (403)', async () => {
    const read = await call('GET', '/companies', { token: tokenDriverA });
    assert.equal(read.status, 403, 'a driver has no business reading customer billing');

    const create = await call('POST', '/companies', {
      token: tokenDriverA,
      body: { name: 'Driver Should Not Create' }
    });
    assert.equal(create.status, 403);
  });

  // ---------------------------------------------------------------------
  // Trips link to a company by the customer name typed on them
  // ---------------------------------------------------------------------

  test('3. Two trips naming the same customer in different letter case share one company', async () => {
    // Walked through the full lifecycle over HTTP: an API-created trip that
    // the dispatcher completes must end up billable with no extra steps.
    const created = await call('POST', globalThis.__billingTripsUrl, {
      token: tokenManagerA,
      body: {
        origin: 'Manesar',
        destination: 'Ahmedabad',
        planned_route: 'Manesar -> Ahmedabad',
        start_time: '2026-09-20T04:00:00.000Z',
        expected_arrival: '2026-09-20T12:00:00.000Z',
        vehicle_id: vehicleA1Id,
        driver_id: driverA1Id,
        external_party_name: 'Sharma Logistics',
        external_party_type: 'CUSTOMER',
        revenue: 25000,
        advance_received: 5000
      }
    });
    assert.equal(created.status, 201, 'trip create failed: ' + JSON.stringify(created.json));
    lifecycleTripId = created.json.data?.id;
    assert.ok(created.json.data?.company_id, 'trip should be linked to a company row');
    // Trips carry the date they were dispatched, resolved in IST (the
    // pg DATE column reaches the API as a timestamp, so compare the IST day).
    const istDay = (value) =>
      new Date(new Date(value).getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
    assert.equal(istDay(created.json.data.trip_date), '2026-09-20');
    sharmaCompanyId = created.json.data.company_id;

    // Walk the real lifecycle: Draft -> Assigned -> Dispatched -> Completed.
    const assigned = await call('PATCH', `${globalThis.__billingTripsUrl}/${lifecycleTripId}/status`, {
      token: tokenManagerA,
      body: { status: 'Assigned' }
    });
    assert.equal(assigned.status, 200, 'assign failed: ' + JSON.stringify(assigned.json));

    const dispatched = await call('PATCH', `${globalThis.__billingTripsUrl}/${lifecycleTripId}/status`, {
      token: tokenManagerA,
      body: { status: 'Dispatched' }
    });
    assert.equal(dispatched.status, 200, 'dispatch failed: ' + JSON.stringify(dispatched.json));

    const completed = await call('PATCH', `${globalThis.__billingTripsUrl}/${lifecycleTripId}/status`, {
      token: tokenManagerA,
      body: { status: 'Completed', actual_distance: 905 }
    });
    assert.equal(completed.status, 200);
    assert.equal(completed.json.data.status, 'Completed');

    // Same customer, typed with different casing and spacing.
    const second = await call('POST', globalThis.__billingTripsUrl, {
      token: tokenManagerA,
      body: {
        origin: 'Ahmedabad',
        destination: 'Pune',
        planned_route: 'Ahmedabad -> Pune',
        start_time: '2026-09-21T04:30:00.000Z',
        expected_arrival: '2026-09-21T18:00:00.000Z',
        external_party_name: '  sharma logistics ',
        revenue: 15000
      }
    });
    assert.equal(second.status, 201);
    sharmaTripL2 = second.json.data;
    assert.equal(
      sharmaTripL2.company_id,
      sharmaCompanyId,
      'case/whitespace variants must collapse into the same company, otherwise one customer splits across bills'
    );

    // Fixture shortcut: this trip exists to prove the customer-name link, so
    // it is marked Completed directly rather than walked through another
    // dispatch cycle (test 3's first trip already covered the real lifecycle).
    await query("UPDATE trips SET status = 'Completed' WHERE id = $1", [sharmaTripL2.id]);

    const companies = await call('GET', '/companies', { token: tokenManagerA });
    const sharma = companies.json.data.filter((c) => c.name.toLowerCase() === 'sharma logistics');
    assert.equal(sharma.length, 1, 'only one company row should exist for the customer');
  });

  test('4. A trip may not be attached to another organization\'s company (400)', async () => {
    const otherCompany = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'Cross Tenant Target' }
    });
    const foreignId = otherCompany.json.data.id;
    await query('UPDATE companies SET organization_id = $1 WHERE id = $2', [TEST_ORGS[1], foreignId]);

    const res = await call('POST', globalThis.__billingTripsUrl, {
      token: tokenManagerA,
      body: {
        origin: 'Delhi',
        destination: 'Jaipur',
        planned_route: 'Delhi -> Jaipur',
        start_time: '2026-09-22T04:00:00.000Z',
        expected_arrival: '2026-09-22T10:00:00.000Z',
        company_id: foreignId,
        revenue: 1000
      }
    });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /another organization/i);

    // Put it back under org A so later tests are unaffected.
    await query('UPDATE companies SET organization_id = $1 WHERE id = $2', [TEST_ORGS[0], foreignId]);
    await query('DELETE FROM companies WHERE id = $1', [foreignId]);
  });

  test('5. Rejects a negative per-trip advance (400)', async () => {
    const res = await call('POST', globalThis.__billingTripsUrl, {
      token: tokenManagerA,
      body: {
        origin: 'Delhi',
        destination: 'Jaipur',
        planned_route: 'Delhi -> Jaipur',
        start_time: '2026-09-22T04:00:00.000Z',
        expected_arrival: '2026-09-22T10:00:00.000Z',
        external_party_name: 'Sharma Logistics',
        advance_received: -500
      }
    });
    assert.equal(res.status, 400);
  });

  // ---------------------------------------------------------------------
  // The unbilled pool: what a bill would be composed from
  // ---------------------------------------------------------------------

  test('6. Preview separates billable trips from ones still in progress and ones with no fare', async () => {
    sharmaTripL1 = (await query('SELECT * FROM trips WHERE id = $1', [lifecycleTripId])).rows[0];

    // Dispatched, not finished: billable only if the caller widens the statuses.
    sharmaTripT3 = await seedTrip({
      company_id: sharmaCompanyId,
      party_name: 'Sharma Logistics',
      revenue: 10000,
      advance: 2000,
      status: 'Dispatched',
      trip_date: '2026-09-22'
    });

    // Another customer, unbilled, but no fare captured. The company is
    // registered explicitly here because this fixture is inserted directly
    // (the API creates companies when a trip names one).
    const guptaCompany = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'Gupta Traders' }
    });
    assert.equal(guptaCompany.status, 201, 'company create failed: ' + JSON.stringify(guptaCompany.json));
    guptaCompanyId = guptaCompany.json.data.id;

    const guptaTrip = await seedTrip({
      company_id: guptaCompanyId,
      party_name: 'Gupta Traders',
      revenue: 0,
      status: 'Completed',
      trip_date: '2026-09-19'
    });
    guptaTripT4 = guptaTrip;

    // Cancelled work must never reach a bill.
    sharmaTripT5 = await seedTrip({
      company_id: sharmaCompanyId,
      party_name: 'Sharma Logistics',
      revenue: 9999,
      status: 'Cancelled',
      trip_date: '2026-09-23'
    });

    const preview = await call('GET', `/companies/${sharmaCompanyId}/unbilled`, { token: tokenManagerA });
    assert.equal(preview.status, 200);
    const data = preview.json.data;

    assert.deepEqual(data.billable_statuses, ['Completed']);
    assert.equal(data.billable.length, 2, 'the two completed trips belong on the bill');
    assert.equal(data.waiting.length, 1, 'the dispatched trip is waiting');
    assert.equal(data.waiting[0].id, sharmaTripT3.id);
    assert.equal(
      data.unpriced.length,
      0,
      'the fare-less trip belongs to a different company, so it is not in this pool'
    );
    assert.equal(data.totals.billable_amount, 40000);
    assert.equal(data.totals.billable_advance, 5000);
    assert.equal(data.projected.balance_due, 35000);
    assert.equal(data.previous_balance, 0);

    // The cancelled trip appears nowhere in the pool.
    const allIds = [...data.billable, ...data.waiting, ...data.unpriced].map((t) => t.id);
    assert.ok(!allIds.includes(sharmaTripT5.id), 'cancelled trips must never be billable');

    // Bringing the dispatched trip forward is an explicit choice.
    const widened = await call('GET', `/companies/${sharmaCompanyId}/unbilled?statuses=Completed,Dispatched`, {
      token: tokenManagerA
    });
    assert.equal(widened.json.data.billable.length, 3);
    assert.equal(widened.json.data.totals.billable_amount, 50000);
  });

  // ---------------------------------------------------------------------
  // Generating a bill
  // ---------------------------------------------------------------------

  test('7. Generating a bill composes the company\'s unbilled trips and freezes them', async () => {
    const res = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId, note: 'September trips' }
    });
    assert.equal(res.status, 201);

    const bill = res.json.data;
    bill1Id = bill.id;
    bill1No = bill.bill_no;

    assert.match(bill.bill_no, /^INV-\d{4}$/);
    assert.equal(bill.previous_balance, '0.00');
    assert.equal(bill.subtotal, '40000.00');
    assert.equal(bill.total_advance, '5000.00');
    assert.equal(bill.balance_due, '35000.00');
    assert.equal(bill.status, 'Unpaid');
    assert.equal(bill.items.length, 2);
    assert.equal(bill.remaining_balance, 35000);
    assert.match(bill.balance_due_in_words, /^Rupees Thirty Five Thousand Only$/);

    // The trips left the unbilled pool and point at this bill.
    const billed = await query(
      'SELECT id, billing_status, bill_id FROM trips WHERE id = ANY($1::uuid[]) ORDER BY id',
      [[lifecycleTripId, sharmaTripL2.id]]
    );
    assert.equal(billed.rows.length, 2);
    for (const row of billed.rows) {
      assert.equal(row.billing_status, 'Billed');
      assert.equal(row.bill_id, bill1Id);
    }

    // An issued bill is a snapshot: editing the trip afterwards must not
    // rewrite it. (Trips are Completed here, so the model refuses the edit.)
    await query('UPDATE trips SET revenue = 99000 WHERE id = $1', [lifecycleTripId]);
    const after = await call('GET', `/bills/${bill1Id}`, { token: tokenManagerA });
    assert.equal(after.json.data.subtotal, '40000.00', 'bill totals must not follow later trip edits');
    await query('UPDATE trips SET revenue = 25000 WHERE id = $1', [lifecycleTripId]);
  });

  test('8. Generating again bills nothing twice and explains what is left', async () => {
    const res = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId }
    });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /not in a billable status/i);

    const trips = await query(
      `SELECT billing_status FROM trips WHERE company_id = $1 AND id = ANY($2::uuid[])`,
      [sharmaCompanyId, [lifecycleTripId, sharmaTripL2.id]]
    );
    assert.equal(trips.rows.filter((r) => r.billing_status === 'Billed').length, 2);
  });

  test('9. A company with unbilled trips but no fares says so instead of raising an empty bill', async () => {
    const res = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: guptaCompanyId }
    });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /no fare/i);
  });

  test('10. A later bill carries the previous unpaid balance forward', async () => {
    // Part-pay bill 1, leaving 25000 outstanding.
    const payment = await call('POST', `/bills/${bill1Id}/payments`, {
      token: tokenManagerA,
      body: { amount: 10000, mode: 'UPI', payment_date: '2026-09-24' }
    });
    assert.equal(payment.status, 201);
    assert.equal(payment.json.data.status, 'Partially Paid');
    assert.equal(payment.json.data.amount_paid, '10000.00');
    assert.equal(payment.json.data.remaining_balance, 25000);

    // Now bill the dispatched trip, widening the statuses beyond the
    // Completed-only default.
    const res = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId, statuses: ['Completed', 'Dispatched'] }
    });
    assert.equal(res.status, 201);

    const bill2 = res.json.data;
    bill2Id = bill2.id;
    bill2No = bill2.bill_no;

    assert.notEqual(bill2.bill_no, bill1No, 'bill numbers must not repeat');
    assert.equal(bill2.previous_balance, '25000.00', 'unpaid balance from bill 1 is carried forward');
    assert.equal(bill2.subtotal, '10000.00');
    assert.equal(bill2.total_advance, '2000.00');
    assert.equal(bill2.balance_due, '33000.00');
  });

  test('11. Rejects a payment larger than the outstanding balance (400)', async () => {
    const res = await call('POST', `/bills/${bill2Id}/payments`, {
      token: tokenManagerA,
      body: { amount: 33000.01, mode: 'Cash', payment_date: '2026-09-25' }
    });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /exceeds the outstanding balance/i);
  });

  test('12. Fully settling a bill marks it Paid and drops it from later carry-forwards', async () => {
    const res = await call('POST', `/bills/${bill1Id}/payments`, {
      token: tokenManagerA,
      body: { amount: 25000, mode: 'NEFT', payment_date: '2026-09-25' }
    });
    assert.equal(res.status, 201);
    assert.equal(res.json.data.status, 'Paid');
    assert.equal(res.json.data.remaining_balance, 0);
    assert.equal(res.json.data.payments.length, 2);

    // Bill 2's carry-forward is fixed at generation time, so it still shows the
    // old figure — that is what the customer was issued.
    const bill2 = await call('GET', `/bills/${bill2Id}`, { token: tokenManagerA });
    assert.equal(bill2.json.data.previous_balance, '25000.00');

    // A new bill for this company now carries only what is still open: bill 1
    // dropped out because it is Paid, bill 2 (33000) is still outstanding.
    const preview = await call('GET', `/companies/${sharmaCompanyId}/unbilled`, { token: tokenManagerA });
    assert.equal(preview.json.data.previous_balance, 33000);
  });

  test('13. A trip on an issued bill cannot have its fare or customer restated (409)', async () => {
    const res = await call('PATCH', `${globalThis.__billingTripsUrl}/${sharmaTripT3.id}`, {
      token: tokenManagerA,
      body: { revenue: 12000 }
    });
    assert.equal(res.status, 409);
    assert.match(res.json.message, /already on an issued bill/i);
  });

  test('14. Voiding an unpaid bill keeps it on record as Void and returns its trips', async () => {
    const res = await call('DELETE', `/bills/${bill2Id}`, {
      token: tokenManagerA,
      body: { reason: 'Raised against the wrong customer' }
    });
    assert.equal(res.status, 200);

    const trip = (await query('SELECT billing_status, bill_id FROM trips WHERE id = $1', [sharmaTripT3.id])).rows[0];
    assert.equal(trip.billing_status, 'Unbilled');
    assert.equal(trip.bill_id, null);

    // The document is NOT deleted: the number stays in the invoice series with
    // when/why it was cancelled, and its lines remain as the record.
    const kept = await call('GET', `/bills/${bill2Id}`, { token: tokenManagerA });
    assert.equal(kept.status, 200);
    assert.equal(kept.json.data.status, 'Void');
    assert.equal(kept.json.data.bill_no, bill2No);
    assert.equal(kept.json.data.void_reason, 'Raised against the wrong customer');
    assert.ok(kept.json.data.voided_at, 'void timestamp recorded');
    assert.equal(kept.json.data.remaining_balance, 0, 'a voided bill is not owed');
    assert.equal(kept.json.data.items.length, 1, 'the snapshot of what it covered survives');

    // A voided bill cannot be voided twice.
    const twice = await call('DELETE', `/bills/${bill2Id}`, { token: tokenManagerA });
    assert.equal(twice.status, 409);
    assert.match(twice.json.message, /already voided/i);

    // Voided bills must not appear as money owed by the customer. Bill 1 was
    // settled earlier in this suite, so nothing is owed at this point — and the
    // voided bill, though still on record, must not change that.
    const companies = await call('GET', '/companies', { token: tokenManagerA });
    const sharmaRow = companies.json.data.find((c) => c.id === sharmaCompanyId);
    assert.equal(Number(sharmaRow.outstanding_balance), 0, 'a voided bill is not owed');
    assert.equal(Number(sharmaRow.open_bill_count), 0, 'a voided bill is not an open bill');

    // And the trips can be billed again — as a new number, never the voided one.
    const regenerate = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId, statuses: ['Dispatched'] }
    });
    assert.equal(regenerate.status, 201);
    assert.notEqual(regenerate.json.data.bill_no, bill2No, 'a voided number is never reused');
    bill2Id = regenerate.json.data.id;
    bill2No = regenerate.json.data.bill_no;
  });

  test('15. A bill with payments cannot be voided (409)', async () => {
    const res = await call('DELETE', `/bills/${bill1Id}`, { token: tokenManagerA });
    assert.equal(res.status, 409);
    assert.match(res.json.message, /payments recorded/i);

    const stillThere = await call('GET', `/bills/${bill1Id}`, { token: tokenManagerA });
    assert.equal(stillThere.status, 200);
  });

  // ---------------------------------------------------------------------
  // Printed document
  // ---------------------------------------------------------------------

  test('16. Download renders a print-ready HTML bill, escaping customer text', async () => {
    // A company name with an ampersand and a script tag: the printed document
    // is HTML, so customer-supplied text must come out escaped.
    const weird = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'A & B <script>alert(1)</script> Transport', address: '12 <b>Main</b> Rd' }
    });
    assert.equal(weird.status, 201);
    ampCompanyId = weird.json.data.id;

    const trip = await seedTrip({
      company_id: ampCompanyId,
      party_name: 'A & B <script>alert(1)</script> Transport',
      revenue: 5000,
      status: 'Completed',
      trip_date: '2026-09-18'
    });
    assert.ok(trip.id);

    const generated = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: ampCompanyId }
    });
    assert.equal(generated.status, 201);
    ampBillId = generated.json.data.id;

    const doc = await fetch(`${baseUrl}/bills/${ampBillId}/download`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(doc.status, 200);
    assert.match(doc.headers.get('content-type'), /text\/html/);
    assert.match(doc.headers.get('content-disposition'), /INV-\d{4}\.html/);

    const html = await doc.text();
    assert.ok(html.includes(generated.json.data.bill_no), 'document should show its bill number');
    assert.ok(html.includes('&#60;script&#62;'), 'script tag must be escaped, not emitted');
    assert.ok(!html.includes('<script>alert(1)</script>'), 'raw customer markup must not survive');
    assert.ok(html.includes('A &#38; B'), 'ampersand must be escaped');
    assert.match(html, /Closing balance/, 'the ledger total block must be present');
  });

  // ---------------------------------------------------------------------
  // Tenant isolation
  // ---------------------------------------------------------------------

  test('17. Another organization cannot see or bill this organization\'s companies and bills (404)', async () => {
    const companies = await call('GET', '/companies', { token: tokenManagerB });
    assert.equal(companies.status, 200);
    assert.equal(companies.json.data.length, 0, 'org B must not see org A companies');

    const company = await call('GET', `/companies/${sharmaCompanyId}`, { token: tokenManagerB });
    assert.equal(company.status, 404);

    const bill = await call('GET', `/bills/${bill1Id}`, { token: tokenManagerB });
    assert.equal(bill.status, 404);

    const generate = await call('POST', '/bills', {
      token: tokenManagerB,
      body: { company_id: sharmaCompanyId }
    });
    assert.equal(generate.status, 404);

    const preview = await call('GET', `/companies/${sharmaCompanyId}/unbilled`, { token: tokenManagerB });
    assert.equal(preview.status, 404);

    const pay = await call('POST', `/bills/${bill1Id}/payments`, {
      token: tokenManagerB,
      body: { amount: 100, mode: 'Cash' }
    });
    assert.equal(pay.status, 404);
  });

  // ---------------------------------------------------------------------
  // Validation and listing
  // ---------------------------------------------------------------------

  test('18. Validates bill and payment input before it reaches the service', async () => {
    const noCompany = await call('POST', '/bills', { token: tokenManagerA, body: { note: 'x' } });
    assert.equal(noCompany.status, 400);

    const cancelled = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId, statuses: ['Cancelled'] }
    });
    assert.equal(cancelled.status, 400);

    const nonsense = await call('POST', '/bills', {
      token: tokenManagerA,
      body: { company_id: sharmaCompanyId, statuses: ['Teleported'] }
    });
    assert.equal(nonsense.status, 400);

    const badMode = await call('POST', `/bills/${bill1Id}/payments`, {
      token: tokenManagerA,
      body: { amount: 100, mode: 'Bitcoin' }
    });
    assert.equal(badMode.status, 400);

    const badAmount = await call('POST', `/bills/${bill1Id}/payments`, {
      token: tokenManagerA,
      body: { amount: 0, mode: 'Cash' }
    });
    assert.equal(badAmount.status, 400);
  });

  test('19. Bills and trips can be listed per company and status', async () => {
    const bills = await call('GET', `/bills?company_id=${sharmaCompanyId}`, { token: tokenManagerA });
    assert.equal(bills.status, 200);
    assert.ok(bills.json.data.length >= 2);
    assert.ok(bills.json.data.every((b) => b.company_id === sharmaCompanyId));

    const paid = await call('GET', '/bills?status=Paid', { token: tokenManagerA });
    assert.ok(paid.json.data.every((b) => b.status === 'Paid'));

    const billedTrips = await call(
      'GET',
      `${globalThis.__billingTripsUrl}?company_id=${sharmaCompanyId}&billing_status=Billed`,
      { token: tokenManagerA }
    );
    assert.equal(billedTrips.status, 200);
    assert.ok(billedTrips.json.data.length >= 1);
    assert.ok(billedTrips.json.data.every((t) => t.billing_status === 'Billed'));
    assert.ok(billedTrips.json.data.every((t) => t.company_id === sharmaCompanyId));
    assert.equal(billedTrips.json.data[0].company_name.toLowerCase(), 'sharma logistics');

    const unbilledTrips = await call(
      'GET',
      `${globalThis.__billingTripsUrl}?company_id=${sharmaCompanyId}&billing_status=Unbilled`,
      { token: tokenManagerA }
    );
    assert.ok(unbilledTrips.json.data.every((t) => t.billing_status === 'Unbilled'));
  });

  test('20. Company records validate, de-duplicate, and refuse deletion while bills exist', async () => {
    const duplicate = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'SHARMA LOGISTICS' }
    });
    assert.equal(duplicate.status, 409);

    const unnamed = await call('POST', '/companies', { token: tokenManagerA, body: {} });
    assert.equal(unnamed.status, 400);

    const updated = await call('PUT', `/companies/${sharmaCompanyId}`, {
      token: tokenManagerA,
      body: { gstin: '27AAACR5055K1Z5', contact_person: 'Mr Sharma' }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.data.gstin, '27AAACR5055K1Z5');

    const deleted = await call('DELETE', `/companies/${sharmaCompanyId}`, { token: tokenManagerA });
    assert.equal(deleted.status, 409, 'a company with billing history must stay on record');

    const listed = await call('GET', '/companies', { token: tokenManagerA });
    const sharma = listed.json.data.find((c) => c.id === sharmaCompanyId);
    // Nothing is waiting to be billed: the dispatched trip was re-billed in
    // test 14, and the cancelled trip is never billable. (COUNT() arrives as a
    // string from Postgres.)
    assert.equal(Number(sharma.unbilled_trip_count), 0);
    assert.equal(Number(sharma.unbilled_amount), 0);
    assert.equal(Number(sharma.open_bill_count), 1, 'the re-generated bill is still unpaid');
    // The regenerated bill (test 14) no longer carries bill 1's old balance,
    // because bill 1 was settled by then: 10000 fare - 2000 advance = 8000.
    assert.equal(Number(sharma.outstanding_balance), 8000, 'what the company still owes');
    assert.equal(sharma.name.toLowerCase(), 'sharma logistics');
  });
});
