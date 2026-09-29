const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('node:fs/promises');
const app = require('../src/app');
const { query, pool } = require('../src/config/db');
const { getReceiptPath } = require('../src/services/maintenanceReceiptStorage');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('TransitOps GPS & Vehicle Locations Backend Tests', { timeout: 60000 }, () => {
  let server;
  let baseUrl;
  let tripsBaseUrl;

  const runSeed = Date.now();
  const orgA = 'e0000000-0000-0000-0000-' + String(runSeed).slice(-12).padStart(12, '0');
  const orgB = 'e0000000-0000-0000-0001-' + String(runSeed).slice(-12).padStart(12, '0');

  let tokenManagerA;
  let tokenDriverA1;
  let tokenDriverA2;
  let tokenDriverB;

  let vehicleAId;
  let driverA1Id;
  let driverA2Id;
  let tripAId;
  let maintenanceReportId;
  let pendingReceiptReportId;

  before(async () => {
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api/locations`;
    tripsBaseUrl = `http://127.0.0.1:${port}/api/trips`;

    // Ensure organizations exist
    await query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [orgA, 'Org Loc A', `org-loc-a-${runSeed}`]);
    await query(`INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [orgB, 'Org Loc B', `org-loc-b-${runSeed}`]);

    // Create vehicle in orgA
    const vehRes = await query(`
      INSERT INTO vehicles (registration_number, type, max_load_capacity, status, organization_id)
      VALUES ($1, 'Van', 2500, 'Available', $2)
      RETURNING id
    `, ['MH-LOC-01', orgA]);
    vehicleAId = vehRes.rows[0].id;

    // Create driver 1 in orgA
    const drv1Res = await query(`
      INSERT INTO drivers (name, contact_number, license_number, license_category, license_expiry_date, status, organization_id)
      VALUES ('Driver One', $1, $2, 'LMV-TR', '2030-01-01', 'Available', $3)
      RETURNING id
    `, [`+918888${String(runSeed).slice(-6)}`, `DL-LOC-1-${runSeed}`, orgA]);
    driverA1Id = drv1Res.rows[0].id;

    // Create driver 2 in orgA
    const drv2Res = await query(`
      INSERT INTO drivers (name, contact_number, license_number, license_category, license_expiry_date, status, organization_id)
      VALUES ('Driver Two', $1, $2, 'LMV-TR', '2030-01-01', 'Available', $3)
      RETURNING id
    `, [`+918887${String(runSeed).slice(-6)}`, `DL-LOC-2-${runSeed}`, orgA]);
    driverA2Id = drv2Res.rows[0].id;

    // Create trip in orgA (Assigned status)
    const tripRes = await query(`
      INSERT INTO trips (
        origin, destination, planned_route, vehicle_id, driver_id, cargo_weight, status,
        start_time, expected_arrival, organization_id
      ) VALUES (
        'Depot A', 'Terminal B', 'Direct Highway 1', $1, $2, 1000, 'Assigned',
        NOW(), NOW() + INTERVAL '2 hours', $3
      ) RETURNING id
    `, [vehicleAId, driverA1Id, orgA]);
    tripAId = tripRes.rows[0].id;

    tokenManagerA = createToken({ id: '80000000-0000-0000-0000-000000000801', email: 'mgrA@loctest.com', role: 'Owner/Manager', organization_id: orgA });
    tokenDriverA1 = createToken({ id: '80000000-0000-0000-0000-000000000802', email: 'driver1@loctest.com', role: 'Driver', driver_id: driverA1Id, organization_id: orgA });
    tokenDriverA2 = createToken({ id: '80000000-0000-0000-0000-000000000803', email: 'driver2@loctest.com', role: 'Driver', driver_id: driverA2Id, organization_id: orgA });
    tokenDriverB = createToken({ id: '80000000-0000-0000-0000-000000000804', email: 'driverB@loctest.com', role: 'Driver', driver_id: '90000000-0000-0000-0000-000000000999', organization_id: orgB });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close(error => (error ? reject(error) : resolve()));
      });
    }
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

  test('11. Driver maintenance reports are tenant-scoped and manager-manageable', async () => {
    const created = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({
        trip_id: tripAId,
        description: 'Brake warning light appeared during the trip.',
        priority: 'Urgent'
      })
    });
    assert.equal(created.status, 201);
    const createdBody = await created.json();
    assert.equal(createdBody.data.trip_id, tripAId);

    const driverReportResponse = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/trip/${tripAId}`, {
      headers: { Authorization: `Bearer ${tokenDriverA1}` }
    });
    assert.equal(driverReportResponse.status, 200);
    assert.equal((await driverReportResponse.json()).data.status, 'Open');

    const prematureFix = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${createdBody.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
      body: JSON.stringify({ status: 'Resolved' })
    });
    assert.equal(prematureFix.status, 400);

    const driverFixing = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${createdBody.data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
      body: JSON.stringify({ status: 'Acknowledged' })
    });
    assert.equal(driverFixing.status, 200);

    for (const action of ['loaded', 'unloaded']) {
      const blockedMilestone = await fetch(`${tripsBaseUrl}/${tripAId}/loading`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
        body: JSON.stringify({ action })
      });
      assert.equal(blockedMilestone.status, 409);
    }

    const blockedCompletion = await fetch(`${tripsBaseUrl}/${tripAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
      body: JSON.stringify({ status: 'Completed' })
    });
    assert.equal(blockedCompletion.status, 409);

    const listed = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(listed.status, 200);
    const listedBody = await listed.json();
    const report = listedBody.data.find(item => item.id === createdBody.data.id);
    assert.ok(report);
    assert.equal(report.vehicle_registration, 'MH-LOC-01');
    assert.equal(report.status, 'Acknowledged');
    pendingReceiptReportId = report.id;

    const historyBeforeFix = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports?view=history`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal((await historyBeforeFix.json()).data.some(item => item.id === report.id), false);

    const closeoutUrl = `${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${report.id}/fix`;
    const missingRepairData = new FormData();
    const missingDataRes = await fetch(closeoutUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenDriverA1}` },
      body: missingRepairData
    });
    assert.equal(missingDataRes.status, 400);

    const pendingCloseout = new FormData();
    pendingCloseout.set('repair_cost', '1250.50');
    pendingCloseout.set('receipt_pending', 'true');
    const fixed = await fetch(closeoutUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenDriverA1}` },
      body: pendingCloseout
    });
    assert.equal(fixed.status, 200);
    const fixedBody = await fixed.json();
    assert.equal(fixedBody.data.status, 'Resolved');
    assert.equal(Number(fixedBody.data.repair_cost), 1250.50);
    assert.equal(fixedBody.data.receipt_pending, true);

    const hiddenResolvedReport = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal((await hiddenResolvedReport.json()).data.some(item => item.id === report.id), false);

    const pendingHistory = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports?view=history`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    const pendingHistoryReport = (await pendingHistory.json()).data.find(item => item.id === report.id);
    assert.ok(pendingHistoryReport);
    assert.equal(pendingHistoryReport.receipt_pending, true);
    assert.equal(Number(pendingHistoryReport.repair_cost), 1250.50);

    const openReport = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenDriverA1}`
      },
      body: JSON.stringify({ trip_id: tripAId, description: 'Steering vibration during braking.', priority: 'Routine' })
    });
    assert.equal(openReport.status, 201);
    maintenanceReportId = (await openReport.json()).data.id;
  });

  test('12. Driver completes only after recording loaded and unloaded milestones', async () => {
    const otherDriverLoad = await fetch(`${tripsBaseUrl}/${tripAId}/loading`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA2}` },
      body: JSON.stringify({ action: 'loaded' })
    });
    assert.equal(otherDriverLoad.status, 403);

    const unloadFirst = await fetch(`${tripsBaseUrl}/${tripAId}/loading`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
      body: JSON.stringify({ action: 'unloaded' })
    });
    assert.equal(unloadFirst.status, 400);

    const prematureCompletion = await fetch(`${tripsBaseUrl}/${tripAId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
      body: JSON.stringify({ status: 'Completed' })
    });
    assert.equal(prematureCompletion.status, 400);

    for (const action of ['loaded', 'unloaded']) {
      const milestone = await fetch(`${tripsBaseUrl}/${tripAId}/loading`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenDriverA1}` },
        body: JSON.stringify({ action })
      });
      assert.equal(milestone.status, 200);
    }

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

    const vehicleInShop = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleAId]);
    assert.equal(vehicleInShop.rows[0].status, 'In Shop');

    const resolved = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${maintenanceReportId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenManagerA}`
      },
      body: JSON.stringify({ status: 'Resolved' })
    });
    assert.equal(resolved.status, 200);
    const vehicleAvailable = await query('SELECT status FROM vehicles WHERE id = $1', [vehicleAId]);
    assert.equal(vehicleAvailable.rows[0].status, 'Available');

    const receiptForm = new FormData();
    receiptForm.append('receipt', new Blob(['%PDF-1.4\nTransitOps test receipt\n%%EOF'], { type: 'application/pdf' }), 'repair-bill.pdf');
    const receiptUpload = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${pendingReceiptReportId}/receipt`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenDriverA1}` },
      body: receiptForm
    });
    assert.equal(receiptUpload.status, 200);
    const receiptUploadedReport = await receiptUpload.json();
    assert.equal(receiptUploadedReport.data.receipt_pending, false);
    assert.equal(receiptUploadedReport.data.receipt_file_name, 'repair-bill.pdf');

    const history = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports?view=history`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    const historyReport = (await history.json()).data.find(item => item.id === pendingReceiptReportId);
    assert.equal(historyReport.has_receipt, true);
    assert.equal(historyReport.receipt_pending, false);
    assert.equal(Number(historyReport.repair_cost), 1250.50);

    const downloadedReceipt = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${pendingReceiptReportId}/receipt`, {
      headers: { Authorization: `Bearer ${tokenManagerA}` }
    });
    assert.equal(downloadedReceipt.status, 200);
    assert.equal(downloadedReceipt.headers.get('content-type'), 'application/pdf');
    assert.match(await downloadedReceipt.text(), /TransitOps test receipt/);

    const crossTenantReceipt = await fetch(`${baseUrl.replace('/locations', '/maintenance')}/driver-reports/${pendingReceiptReportId}/receipt`, {
      headers: { Authorization: `Bearer ${tokenDriverB}` }
    });
    assert.equal(crossTenantReceipt.status, 404);
  });

  test('13. Location recording is rejected after trip is Completed', async () => {
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

  after(async () => {
    try {
      await query('ALTER TABLE vehicle_locations DISABLE TRIGGER trg_prevent_telemetry_delete');
      await query('DELETE FROM vehicle_locations WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('ALTER TABLE vehicle_locations ENABLE TRIGGER trg_prevent_telemetry_delete');
      const receipts = await query('SELECT receipt_storage_key FROM maintenance_reports WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await Promise.all(receipts.rows.map(async receipt => {
        const filePath = getReceiptPath(receipt.receipt_storage_key);
        if (filePath) await fs.unlink(filePath).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }));
      await query('DELETE FROM maintenance_reports WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('DELETE FROM trips WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('DELETE FROM vehicles WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('DELETE FROM drivers WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('DELETE FROM users WHERE organization_id IN ($1, $2)', [orgA, orgB]);
      await query('DELETE FROM organizations WHERE id IN ($1, $2)', [orgA, orgB]);
    } catch (e) {
      console.error('Location test cleanup error:', e);
    } finally {
      if (server) {
        await new Promise(r => server.close(r));
      }
    }
  });
});
