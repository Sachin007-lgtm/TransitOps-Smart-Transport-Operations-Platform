// Self-contained end-to-end test: boots the Express app in-process,
// exercises the billing API against DATABASE_URL, prints results, exits.
// Usage: DATABASE_URL=postgres://... node test-billing.js
const http = require('http');
require('dotenv').config();

// Only fall back to the local Docker test DB when no env/.env URL exists.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://transitops:test123@localhost:55432/transitops';
  console.log('NOTE: DATABASE_URL not set — using local Docker test default.');
}
process.env.PORT = '5099';

const app = require('./src/app');

const server = app.listen(process.env.PORT, async () => {
  const BASE = `http://localhost:${process.env.PORT}/api`;
  const results = [];
  let bill1Id = null;

  const call = (method, path, body) => new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) }
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: { raw } }); }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (data) req.write(data);
    req.end();
  });

  const check = (name, status, expected, actual) => {
    const pass = typeof expected === 'function' ? expected(status) : status === expected;
    results.push({ name, pass, status, actual });
    const shown = actual === undefined ? '(none)' : JSON.stringify(actual).slice(0, 220);
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (http ${status})  ${shown}`);
  };

  try {
    // 1. Health
    let r = await call('GET', '/health');
    check('health', r.status, 200, r.body.status);

    // 2. Companies with unbilled aggregates
    r = await call('GET', '/billing/companies');
    const companies = r.body.data || [];
    check('companies list', r.status, 200, companies.map(c => `${c.name}: unbilled=${c.unbilled_trip_count} amt=${c.unbilled_amount} outstanding=${c.outstanding_balance}`));

    // 3. Generate bill for company 1
    r = await call('POST', '/billing/bills', { company_id: 1 });
    const bill1 = r.body.data || {};
    bill1Id = bill1.id;
    check('generate bill co1', r.status, 201, `${bill1.bill_no} prev=${bill1.previous_balance} subtotal=${bill1.subtotal} advance=${bill1.total_advance} balance=${bill1.balance_due} items=${(bill1.items || []).length}`);
    console.log(`      words: ${bill1.balance_due_in_words}`);

    // Expected: subtotal 37000 (25000+3000+9000), advance 500, balance 36500
    const b1ok = parseFloat(bill1.subtotal) === 37000 && parseFloat(bill1.total_advance) === 500 && parseFloat(bill1.balance_due) === 36500;
    results.push({ name: 'bill1 ledger math (37000-500=36500)', pass: b1ok, status: r.status, actual: `${bill1.subtotal} - ${bill1.total_advance} = ${bill1.balance_due}` });
    console.log(`${b1ok ? 'PASS' : 'FAIL'}  bill1 ledger math: ${bill1.subtotal} - ${bill1.total_advance} = ${bill1.balance_due}`);

    // 4. Re-generate -> 400 (no unbilled trips left)
    r = await call('POST', '/billing/bills', { company_id: 1 });
    check('re-generate rejected (400)', r.status, 400, r.body.message);

    // 5. Partial payment -> Partially Paid
    r = await call('POST', `/billing/bills/${bill1Id}/payments`, { amount: 10000, mode: 'IMPS' });
    check('partial payment -> Partially Paid', r.status, 201, (r.body.data || {}).status);

    // 6. Full payment -> Paid
    r = await call('POST', `/billing/bills/${bill1Id}/payments`, { amount: 26500, mode: 'NEFT' });
    check('full payment -> Paid', r.status, 201, (r.body.data || {}).status);

    // 7. Overpayment rejected
    r = await call('POST', `/billing/bills/${bill1Id}/payments`, { amount: 500, mode: 'Cash' });
    check('overpayment rejected (400)', r.status, 400, r.body.message);

    // 8. Bill for company 2 — previous balance 0 (bill 1 settled)
    r = await call('POST', '/billing/bills', { company_id: 2 });
    const bill2 = r.body.data || {};
    check('generate bill co2', r.status, 201, `${bill2.bill_no} prev=${bill2.previous_balance} subtotal=${bill2.subtotal} advance=${bill2.total_advance} balance=${bill2.balance_due}`);
    const b2prevOk = parseFloat(bill2.previous_balance) === 0;
    results.push({ name: 'co2 previous_balance = 0 (bill1 paid)', pass: b2prevOk, status: 200, actual: bill2.previous_balance });
    console.log(`${b2prevOk ? 'PASS' : 'FAIL'}  co2 previous_balance=0: ${bill2.previous_balance}`);

    // 9. Bill for company 3
    r = await call('POST', '/billing/bills', { company_id: 3 });
    const bill3 = r.body.data || {};
    check('generate bill co3', r.status, 201, `${bill3.bill_no} prev=${bill3.previous_balance} balance=${bill3.balance_due}`);

    // 10. Co2 outstanding = bill2 balance (unpaid bill carries forward)
    r = await call('GET', '/billing/companies');
    const co2 = (r.body.data || []).find(c => c.id === 2);
    const co2ok = Math.abs(parseFloat(co2.outstanding_balance) - parseFloat(bill2.balance_due)) < 0.01;
    results.push({ name: 'co2 outstanding == bill2 balance', pass: co2ok, status: 200, actual: co2.outstanding_balance });
    console.log(`${co2ok ? 'PASS' : 'FAIL'}  co2 outstanding: ${co2.outstanding_balance} (bill2 balance ${bill2.balance_due})`);

    // 11. Consecutive bill numbers
    r = await call('GET', '/billing/bills');
    const nos = (r.body.data || []).map(b => b.bill_no).sort();
    const nosOk = JSON.stringify(nos) === JSON.stringify(['INV-0001', 'INV-0002', 'INV-0003']);
    results.push({ name: 'consecutive bill numbers', pass: nosOk, status: 200, actual: nos });
    console.log(`${nosOk ? 'PASS' : 'FAIL'}  bill numbers: ${nos.join(', ')}`);

    // 12. Delete bill 3 -> co3 trips return to unbilled pool
    r = await call('DELETE', `/billing/bills/${bill3.id}`);
    check('delete bill3', r.status, 200, r.body.message);
    r = await call('GET', '/billing/companies/3');
    const co3unbilled = (r.body.data || {}).unbilled_trips || [];
    const co3ok = co3unbilled.length === 2;
    results.push({ name: 'co3 trips restored to unbilled', pass: co3ok, status: 200, actual: co3unbilled.length });
    console.log(`${co3ok ? 'PASS' : 'FAIL'}  co3 unbilled trips after delete: ${co3unbilled.length}`);

    // 13. Validation: missing company_id
    r = await call('POST', '/billing/bills', {});
    check('validation: no company_id (400)', r.status, 400, r.body.errors);

    // 14. Trips API filters with new fields
    r = await call('GET', '/trips?billing_status=Unbilled&status=Completed');
    const unbilledTrips = (r.body.data || []).length;
    r = await call('GET', '/trips?company_id=2');
    const co2Trips = (r.body.data || []).length;
    const tripsOk = co2Trips === 2;
    results.push({ name: 'trips filters (company_id=2 -> 2 trips)', pass: tripsOk, status: 200, actual: `unbilled_completed=${unbilledTrips} co2_trips=${co2Trips}` });
    console.log(`${tripsOk ? 'PASS' : 'FAIL'}  trips filters: unbilled_completed=${unbilledTrips}, company2_trips=${co2Trips}`);

    // 15. Bill detail: payments list + words
    r = await call('GET', `/billing/bills/${bill1Id}`);
    const d = r.body.data || {};
    const detOk = d.status === 'Paid' && (d.payments || []).length === 2 && d.company_name && d.balance_due_in_words;
    results.push({ name: 'bill detail (paid, 2 payments, words)', pass: detOk, status: 200, actual: `${d.status}/${(d.payments || []).length} payments/${d.company_name}` });
    console.log(`${detOk ? 'PASS' : 'FAIL'}  bill1 detail: status=${d.status} payments=${(d.payments || []).length} words="${d.balance_due_in_words}"`);

    // 16. Assign a trip to a company (unassigned completed trip flow)
    r = await call('GET', '/trips?status=Completed');
    const completed = r.body.data || [];
    const unassigned = completed.find(t => !t.company_id);
    if (unassigned) {
      r = await call('PUT', `/billing/trips/${unassigned.id}/assign-company`, { company_id: 3 });
      check('assign trip to company', r.status, 200, (r.body.data || {}).company_id);
    } else {
      console.log('SKIP assign trip (none unassigned)');
    }

    // 17. Add company (create endpoint) — unique name per run for idempotent re-tests
    const testCoName = `Test Co LLC ${Date.now()}`;
    r = await call('POST', '/billing/companies', { name: testCoName, opening_balance: 1500 });
    check('create company', r.status, 201, `${(r.body.data || {}).name} opening=${(r.body.data || {}).opening_balance}`);

    // 18. Company with opening balance + unbilled trip -> previous balance math
    //     Give Test Co LLC a completed trip, then generate: prev should be 1500.
    const testCo = r.body.data;
    r = await call('POST', '/trips', {
      source: 'Noida', destination: 'Delhi', vehicle_id: 1, driver_id: 1,
      cargo_weight: 100, planned_distance: 40, revenue: 5000, status: 'Completed',
      company_id: testCo.id, trip_date: '2026-09-10', advance_received: 0
    });
    check('create completed trip for Test Co', r.status, 201, (r.body.data || {}).id);
    r = await call('POST', '/billing/bills', { company_id: testCo.id });
    const bill4 = r.body.data || {};
    const prevOk = parseFloat(bill4.previous_balance) === 1500 && parseFloat(bill4.balance_due) === 6500;
    results.push({ name: 'opening_balance carried into bill prev (1500)', pass: prevOk, status: r.status, actual: `prev=${bill4.previous_balance} balance=${bill4.balance_due}` });
    console.log(`${prevOk ? 'PASS' : 'FAIL'}  opening-balance carry: prev=${bill4.previous_balance} balance=${bill4.balance_due} (expect 1500/6500)`);

    // 19. Delete company with bills -> 409
    r = await call('DELETE', `/billing/companies/${testCo.id}`);
    check('delete company with bills (409)', r.status, 409, r.body.message);
  } catch (e) {
    console.error('TEST CRASH:', e);
  } finally {
    const failed = results.filter(x => !x.pass);
    console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
    if (failed.length) {
      console.log('FAILED:', failed.map(f => f.name).join(' | '));
      process.exitCode = 1;
    }
    server.close(() => process.exit(process.exitCode || 0));
  }
});
