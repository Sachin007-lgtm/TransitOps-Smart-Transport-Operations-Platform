// End-to-end API suite for the running statement: one open statement per
// customer that always reflects the unbilled trips AND charges, plus the
// single action that issues it as a numbered document.
//
// Same harness style as billing.test.js: real HTTP against a real Postgres,
// JWT minted with the local secret. Fixture note: trips that need a non-Draft
// status are inserted directly (walking the dispatch lifecycle adds nothing
// here), charges are always created through the API because that is the flow
// under test.

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

const ORG_A = 'ee000000-0000-0000-0000-000000000001';
const ORG_B = 'ee000000-0000-0000-0000-000000000002';
const TEST_ORGS = [ORG_A, ORG_B];

describe('TransitOps Customer Statement Backend Tests', () => {
  let server;
  let baseUrl; // /api/billing
  let tripsUrl; // /api/trips

  let tokenManagerA;
  let tokenDispatcherA;
  let tokenManagerB;

  let sharmaId;
  let guptaId;
  let sharmaTripIds = [];
  let sharmaChargeIds = [];

  async function call(method, path, { token, body } = {}) {
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
      json = null; // the document download answers with HTML
    }
    return { status: res.status, json, text };
  }

  async function seedTrip({ organization_id = ORG_A, company_id, revenue, advance = 0, status = 'Completed', trip_date = '2026-10-01', party = 'Sharma Logistics' }) {
    const result = await query(
      `INSERT INTO trips (
         organization_id, external_party_name, external_party_type,
         origin, destination, planned_route, cargo_weight,
         revenue, start_time, expected_arrival, status,
         company_id, trip_date, advance_received
       ) VALUES (
         $1, $2, 'CUSTOMER', 'Manesar', 'Ahmedabad', 'Manesar -> Ahmedabad', 900,
         $3, $4::date + time '09:00', $4::date + time '14:00', $5,
         $6, $4::date, $7
       ) RETURNING *;`,
      [organization_id, party, revenue, trip_date, status, company_id, advance]
    );
    return result.rows[0];
  }

  async function statement(companyId, token = tokenManagerA, statuses = '') {
    const suffix = statuses ? `?statuses=${statuses}` : '';
    return call('GET', `/companies/${companyId}/statement${suffix}`, { token });
  }

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/billing`;
    tripsUrl = `http://127.0.0.1:${port}/api/trips`;

    await query(
      `DELETE FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE organization_id = ANY($1::uuid[]))`,
      [TEST_ORGS]
    );
    await query(`UPDATE trips SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`UPDATE charges SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bills WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM charges WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM trips WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM companies WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bill_counters WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [TEST_ORGS]);

    await query(
      `INSERT INTO organizations (id, name, slug, status)
       VALUES ('ee000000-0000-0000-0000-000000000001', 'Statement Test Org A', 'stmt-test-a', 'Active'),
              ('ee000000-0000-0000-0000-000000000002', 'Statement Test Org B', 'stmt-test-b', 'Active')
       ON CONFLICT (id) DO NOTHING;`
    );

    tokenManagerA = createToken({ id: '80000000-0000-0000-0000-000000000801', email: 'stmtA@test.com', role: 'Owner/Manager', organization_id: ORG_A });
    tokenDispatcherA = createToken({ id: '80000000-0000-0000-0000-000000000802', email: 'stmtdispA@test.com', role: 'Dispatcher', organization_id: ORG_A });
    tokenManagerB = createToken({ id: '80000000-0000-0000-0000-000000000803', email: 'stmtB@test.com', role: 'Owner/Manager', organization_id: ORG_B });

    const sharma = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'Sharma Logistics', opening_balance: 0 }
    });
    assert.equal(sharma.status, 201);
    sharmaId = sharma.json.data.id;

    const gupta = await call('POST', '/companies', {
      token: tokenManagerA,
      body: { name: 'Gupta Traders' }
    });
    guptaId = gupta.json.data.id;
  });

  after(async () => {
    await query(`UPDATE trips SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`UPDATE charges SET bill_id = NULL WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bills WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM charges WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM trips WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM companies WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM bill_counters WHERE organization_id = ANY($1::uuid[])`, [TEST_ORGS]);
    await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [TEST_ORGS]);
    server.close();
  });

  // ---------------------------------------------------------------------
  // Access + the shape of the open statement
  // ---------------------------------------------------------------------

  test('1. The statement is protected and readable by the roles that run the work', async () => {
    const unauth = await call('GET', `/companies/${sharmaId}/statement`);
    assert.equal(unauth.status, 401);

    const dispatcher = await statement(sharmaId, tokenDispatcherA);
    assert.equal(dispatcher.status, 200);
    assert.equal(dispatcher.json.data.status, 'Open');
  });

  test('2. A brand new customer has an empty, zeroed open statement', async () => {
    const res = await statement(sharmaId);
    assert.equal(res.status, 200);
    const s = res.json.data;
    assert.equal(s.previous_balance, 0);
    assert.equal(s.pending_count, 0);
    assert.equal(s.ledger.fares, 0);
    assert.equal(s.ledger.charges, 0);
    assert.equal(s.ledger.closing_balance, 0);
    assert.deepEqual(s.charges.billable, []);
  });

  test('3. Trips and charges are both reflected as soon as they exist', async () => {
    const tripA = await seedTrip({ company_id: sharmaId, revenue: 20000, advance: 3000, trip_date: '2026-10-01' });
    const tripB = await seedTrip({ company_id: sharmaId, revenue: 12000, trip_date: '2026-10-02' });
    sharmaTripIds = [tripA.id, tripB.id];

    const chargeA = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Toll — Manesar to Ahmedabad', amount: 1500, kind: 'TOLL', charge_date: '2026-10-02' }
    });
    assert.equal(chargeA.status, 201);
    assert.equal(chargeA.json.data.billing_status, 'Unbilled');
    sharmaChargeIds.push(chargeA.json.data.id);

    const chargeB = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Loading charges', amount: 800, kind: 'LOADING', charge_date: '2026-10-02' }
    });
    assert.equal(chargeB.status, 201);
    sharmaChargeIds.push(chargeB.json.data.id);

    const res = await statement(sharmaId);
    const s = res.json.data;
    assert.equal(s.billable.length, 2, 'both completed trips belong on the open statement');
    assert.equal(s.charges.billable.length, 2);
    assert.equal(s.ledger.fares, 32000);
    assert.equal(s.ledger.charges, 2300);
    assert.equal(s.ledger.advances, 3000);
    // Ledger: previous 0 + fares 32000 + charges 2300 - advances 3000
    assert.equal(s.ledger.closing_balance, 31300);
    assert.equal(s.pending_count, 4);
  });

  test('4. Charges validate: no zero lines, known kinds, and the trip must be the same customer', async () => {
    const zero = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Nothing', amount: 0 }
    });
    assert.equal(zero.status, 400);

    const badKind = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Weird', amount: 100, kind: 'BRIBE' }
    });
    assert.equal(badKind.status, 400);

    const noDescription = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { amount: 100 }
    });
    assert.equal(noDescription.status, 400);

    // A trip of a different customer cannot carry this customer's charge.
    const guptaTrip = await seedTrip({
      company_id: guptaId,
      party: 'Gupta Traders',
      revenue: 5000,
      trip_date: '2026-10-03'
    });
    const crossCustomer = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Wrong trip', amount: 200, trip_id: guptaTrip.id }
    });
    assert.equal(crossCustomer.status, 400);

    const unknownCompany = await call('POST', '/companies/999999/charges', {
      token: tokenManagerA,
      body: { description: 'Nowhere', amount: 200 }
    });
    assert.equal(unknownCompany.status, 404);
  });

  test('5. A Dispatcher can read the statement but not put money on it', async () => {
    const res = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenDispatcherA,
      body: { description: 'Should not be allowed', amount: 500 }
    });
    assert.equal(res.status, 403);
  });

  test('6. Editing or removing an unbilled charge moves the closing balance', async () => {
    const edit = await call('PATCH', `/charges/${sharmaChargeIds[1]}`, {
      token: tokenManagerA,
      body: { amount: 1000 }
    });
    assert.equal(edit.status, 200);

    let s = (await statement(sharmaId)).json.data;
    assert.equal(s.ledger.charges, 2500, '1500 toll + 1000 loading');
    assert.equal(s.ledger.closing_balance, 31500);

    const remove = await call('DELETE', `/charges/${sharmaChargeIds[1]}`, { token: tokenManagerA });
    assert.equal(remove.status, 200);

    s = (await statement(sharmaId)).json.data;
    assert.equal(s.ledger.charges, 1500);
    assert.equal(s.ledger.closing_balance, 30500);

    const again = await call('DELETE', `/charges/${sharmaChargeIds[1]}`, { token: tokenManagerA });
    assert.equal(again.status, 404);
  });

  // ---------------------------------------------------------------------
  // Issuing the statement
  // ---------------------------------------------------------------------

  let issuedBillId;
  let issuedBillNo;

  test('7. Issuing snapshots every pending line into one numbered document', async () => {
    const res = await call('POST', `/companies/${sharmaId}/statement/issue`, {
      token: tokenManagerA,
      body: { note: 'October work' }
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));

    const bill = res.json.data;
    issuedBillId = bill.id;
    issuedBillNo = bill.bill_no;

    assert.match(bill.bill_no, /^INV-\d{4}$/);
    assert.equal(bill.previous_balance, '0.00');
    assert.equal(bill.subtotal, '32000.00', 'fares');
    assert.equal(bill.charges_total, '1500.00');
    assert.equal(bill.total_advance, '3000.00');
    assert.equal(bill.balance_due, '30500.00', 'previous + fares + charges - advances');
    assert.equal(bill.items.length, 2);
    assert.equal(bill.charges.length, 1);
    assert.equal(bill.charges[0].description, 'Toll — Manesar to Ahmedabad');
    assert.match(bill.balance_due_in_words, /Thirty Thousand Five Hundred Only$/);

    // Nothing is left pending, so the open statement is empty again.
    const s = (await statement(sharmaId)).json.data;
    assert.equal(s.pending_count, 0);
    assert.equal(s.ledger.fares, 0);
    assert.equal(s.ledger.charges, 0);
    assert.equal(s.previous_balance, 30500, 'the issued statement is now the previous balance');
    assert.equal(s.ledger.closing_balance, 30500);
  });

  test('8. Issuing again with nothing pending is refused, and the statement cannot double-issue', async () => {
    const res = await call('POST', `/companies/${sharmaId}/statement/issue`, {
      token: tokenManagerA,
      body: {}
    });
    assert.equal(res.status, 400);
    assert.match(res.json.message, /Nothing to issue/i);

    const bills = await call('GET', `/bills?company_id=${sharmaId}`, { token: tokenManagerA });
    assert.equal(bills.json.data.length, 1, 'no second document was created');
  });

  test('9. A charge on an issued statement is frozen, not editable', async () => {
    const edit = await call('PATCH', `/charges/${sharmaChargeIds[0]}`, {
      token: tokenManagerA,
      body: { amount: 9999 }
    });
    assert.equal(edit.status, 409);
    assert.match(edit.json.message, /already on issued statement/i);

    const remove = await call('DELETE', `/charges/${sharmaChargeIds[0]}`, { token: tokenManagerA });
    assert.equal(remove.status, 409);

    const bill = await call('GET', `/bills/${issuedBillId}`, { token: tokenManagerA });
    assert.equal(bill.json.data.charges_total, '1500.00', 'the issued document must not follow later edits');
  });

  test('10. New work accumulates on the next open statement and carries the old balance', async () => {
    const trip = await seedTrip({ company_id: sharmaId, revenue: 8000, trip_date: '2026-10-05' });
    const charge = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerA,
      body: { description: 'Detention at unloading', amount: 2000, kind: 'DETENTION', charge_date: '2026-10-05' }
    });
    assert.equal(charge.status, 201);

    const s = (await statement(sharmaId)).json.data;
    assert.equal(s.previous_balance, 30500, 'unpaid issued statement carries forward');
    assert.equal(s.ledger.fares, 8000);
    assert.equal(s.ledger.charges, 2000);
    assert.equal(s.ledger.closing_balance, 40500);
    assert.equal(s.billable[0].id, trip.id);
  });

  test('11. Paying an issued statement reduces what the next one carries forward', async () => {
    const pay = await call('POST', `/bills/${issuedBillId}/payments`, {
      token: tokenManagerA,
      body: { amount: 5000, mode: 'NEFT', payment_date: '2026-10-06' }
    });
    assert.equal(pay.status, 201);
    assert.equal(pay.json.data.status, 'Partially Paid');

    const s = (await statement(sharmaId)).json.data;
    assert.equal(s.previous_balance, 25500, '30500 issued - 5000 paid');
    assert.equal(s.ledger.closing_balance, 35500, '25500 carried + 8000 fares + 2000 charges');
  });

  test('12. Voiding an issued statement returns both trips and charges to the open one', async () => {
    // Ledger discipline first: a statement that has been paid cannot be voided.
    const refused = await call('DELETE', `/bills/${issuedBillId}`, { token: tokenManagerA });
    assert.equal(refused.status, 409);
    assert.match(refused.json.message, /payments recorded/i);

    // Fixture: clear that payment so the void path itself can be exercised.
    // amount_paid/status are denormalized on the bill, so both have to go —
    // which is itself the reason the API refuses to void a settled statement.
    await query('DELETE FROM payments WHERE bill_id = $1', [issuedBillId]);
    await query("UPDATE bills SET amount_paid = 0, status = 'Unpaid' WHERE id = $1", [issuedBillId]);

    const voided = await call('DELETE', `/bills/${issuedBillId}`, { token: tokenManagerA });
    assert.equal(voided.status, 200, JSON.stringify(voided.json));

    const s = (await statement(sharmaId)).json.data;
    assert.equal(s.previous_balance, 0, 'nothing issued remains outstanding');
    assert.equal(s.billable.length, 3, 'both original trips plus the later one are pending again');
    assert.equal(s.ledger.fares, 40000);
    assert.equal(s.ledger.charges, 3500, 'the frozen toll is pending again, together with the detention charge');
    assert.equal(s.ledger.advances, 3000);

    const chargeRow = await call('GET', `/charges?company_id=${sharmaId}`, { token: tokenManagerA });
    assert.ok(chargeRow.json.data.every((c) => c.billing_status === 'Unbilled'));

    // Re-issuing reproduces the same figures under a new number.
    const reissue = await call('POST', `/companies/${sharmaId}/statement/issue`, { token: tokenManagerA, body: {} });
    assert.equal(reissue.status, 201);
    const bill = reissue.json.data;
    assert.notEqual(bill.bill_no, issuedBillNo);
    assert.equal(bill.subtotal, '40000.00');
    assert.equal(bill.charges_total, '3500.00');
    assert.equal(bill.balance_due, '40500.00');
    issuedBillId = bill.id;
  });

  test('13. The printed statement carries the charges section and the ledger lines', async () => {
    const res = await fetch(`${baseUrl}/bills/${issuedBillId}/download`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Other charges'), 'charges section present');
    assert.ok(html.includes('Toll — Manesar to Ahmedabad'), 'charge description rendered');
    assert.ok(html.includes('Previous balance'));
    assert.ok(html.includes('Fares this period'));
    assert.ok(html.includes('Less: advances received'));
    assert.ok(html.includes('Closing balance'));
  });

  test('14. Statements and charges are organization-scoped', async () => {
    const otherStatement = await statement(sharmaId, tokenManagerB);
    assert.equal(otherStatement.status, 404);

    const otherCharges = await call('GET', `/charges?company_id=${sharmaId}`, { token: tokenManagerB });
    assert.equal(otherCharges.status, 200);
    assert.equal(otherCharges.json.data.length, 0, 'org B sees none of org A charges');

    const addToForeign = await call('POST', `/companies/${sharmaId}/charges`, {
      token: tokenManagerB,
      body: { description: 'Cross tenant', amount: 100 }
    });
    assert.equal(addToForeign.status, 404);

    const issueForeign = await call('POST', `/companies/${sharmaId}/statement/issue`, {
      token: tokenManagerB,
      body: {}
    });
    assert.equal(issueForeign.status, 404);
  });

  test('15. A partial issue includes only what was named and leaves the rest pending', async () => {
    // Everything is currently on the issued statement; void it so there is a
    // pending pool to slice.
    await call('DELETE', `/bills/${issuedBillId}`, { token: tokenManagerA });

    const before = (await statement(sharmaId)).json.data;
    const oneTrip = before.billable[0].id;
    const oneCharge = before.charges.billable[0].id;

    const res = await call('POST', `/companies/${sharmaId}/statement/issue`, {
      token: tokenManagerA,
      body: { trip_ids: [oneTrip], charge_ids: [oneCharge] }
    });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    const bill = res.json.data;
    assert.equal(bill.items.length, 1);
    assert.equal(bill.charges.length, 1);
    // The named lines, plus whatever was already outstanding from earlier
    // issued statements (25500 carried) — issuing part of the pool does not
    // write off the rest of the balance.
    const expected = (
      parseFloat(before.previous_balance) +
      parseFloat(before.billable[0].revenue) +
      parseFloat(before.charges.billable[0].amount) -
      parseFloat(before.billable[0].advance_received)
    ).toFixed(2);
    assert.equal(bill.balance_due, expected);

    const after = (await statement(sharmaId)).json.data;
    assert.equal(after.pending_count, before.pending_count - 2, 'the unnamed lines stay pending');

    // Leave the fixture tidy for the cleanup in after().
    await call('DELETE', `/bills/${bill.id}`, { token: tokenManagerA });
  });
});
