require('dotenv').config();
const http = require('http');

let TOKEN = '';
let vehicleId = '';
let driverId = '';
let tripId = '';
let maintenanceId = '';
let fuelId = '';
let expenseId = '';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('\n========== TransitOps Part B Smoke Tests ==========\n');

  // 1. Login
  let r = await request('POST', '/auth/login', { email: 'fleet@transitops.com', password: 'password123' });
  TOKEN = r.body.data?.token;
  console.log(`[1] Login (Fleet Manager)   → ${r.status} ${r.body.success ? '✅' : '❌'}`);

  // 2. Setup (Create Vehicle & Driver)
  r = await request('POST', '/vehicles', { registration_number: 'TEST-B-001', name: 'Van', type: 'Van', max_load_capacity: 500, odometer: 1000 }, TOKEN);
  vehicleId = r.body.data?.id;
  r = await request('POST', '/drivers', { name: 'Driver B', license_number: 'DL-B-999', license_category: 'C', license_expiry_date: '2028-01-01', contact_number: '9999999999' }, TOKEN);
  driverId = r.body.data?.id;
  console.log(`[2] Setup Vehicle/Driver    → ${vehicleId && driverId ? '✅' : '❌'}`);

  // 3. Create Trip (Draft)
  r = await request('POST', '/trips', { source: 'A', destination: 'B', vehicle_id: vehicleId, driver_id: driverId, cargo_weight: 100, planned_distance: 50 }, TOKEN);
  tripId = r.body.data?.id;
  console.log(`[3] POST /trips (Draft)     → ${r.status} ${r.body.success ? '✅ ' + r.body.data.status : '❌ ' + JSON.stringify(r.body)}`);

  // 4. Dispatch Trip
  r = await request('PUT', `/trips/${tripId}`, { status: 'Dispatched' }, TOKEN);
  console.log(`[4] PUT /trips (Dispatch)   → ${r.status} ${r.body.success ? '✅ ' + r.body.data.status : '❌'}`);

  // 4b. Verify Vehicle Status
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  console.log(`[4b] Verify Vehicle Status  → ${r.status} ${r.body.data?.status === 'On Trip' ? '✅ On Trip' : '❌ ' + r.body.data?.status}`);

  // 5. Complete Trip
  r = await request('PUT', `/trips/${tripId}`, { status: 'Completed', actual_distance: 55, revenue: 200 }, TOKEN);
  console.log(`[5] PUT /trips (Complete)   → ${r.status} ${r.body.success ? '✅ ' + r.body.data.status : '❌'}`);

  // 5b. Verify Vehicle Status & Odometer
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  const odometerUpdated = Number(r.body.data?.odometer) === 1055;
  console.log(`[5b] Verify Vehicle         → ${r.status} ${r.body.data?.status === 'Available' && odometerUpdated ? '✅ Available & Odometer updated' : '❌ ' + JSON.stringify(r.body.data)}`);

  // 6. Create Maintenance Log (In Shop)
  r = await request('POST', '/maintenance', { vehicle_id: vehicleId, description: 'Oil change', cost: 150 }, TOKEN);
  maintenanceId = r.body.data?.id;
  console.log(`[6] POST /maintenance       → ${r.status} ${r.body.success ? '✅' : '❌'}`);
  
  // 6b. Verify Vehicle Status
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  console.log(`[6b] Verify Vehicle Status  → ${r.status} ${r.body.data?.status === 'In Shop' ? '✅ In Shop' : '❌'}`);

  // 7. Complete Maintenance
  r = await request('PUT', `/maintenance/${maintenanceId}`, { status: 'Closed' }, TOKEN);
  console.log(`[7] PUT /maintenance        → ${r.status} ${r.body.success ? '✅' : '❌'}`);

  // 8. Create Fuel Log
  r = await request('POST', '/fuel', { vehicle_id: vehicleId, trip_id: tripId, liters: 10, cost: 40 }, TOKEN);
  fuelId = r.body.data?.id;
  console.log(`[8] POST /fuel              → ${r.status} ${r.body.success ? '✅' : '❌'}`);

  // 9. Create Expense
  r = await request('POST', '/expenses', { vehicle_id: vehicleId, trip_id: tripId, description: 'Toll', amount: 15 }, TOKEN);
  expenseId = r.body.data?.id;
  console.log(`[9] POST /expenses          → ${r.status} ${r.body.success ? '✅' : '❌'}`);

  // 10. Dashboard Analytics
  r = await request('GET', '/reports/dashboard', null, TOKEN);
  console.log(`[10] GET /reports/dashboard → ${r.status} ${r.body.success ? '✅ ' + JSON.stringify(r.body.data.financials) : '❌'}`);

  // Cleanup
  if (expenseId) await request('DELETE', `/expenses/${expenseId}`, null, TOKEN);
  if (fuelId) await request('DELETE', `/fuel/${fuelId}`, null, TOKEN);
  if (maintenanceId) await request('DELETE', `/maintenance/${maintenanceId}`, null, TOKEN);
  if (tripId) await request('DELETE', `/trips/${tripId}`, null, TOKEN);
  if (vehicleId) await request('DELETE', `/vehicles/${vehicleId}`, null, TOKEN);
  if (driverId) await request('DELETE', `/drivers/${driverId}`, null, TOKEN);
  
  console.log(`[11] Cleanup                → ✅ Done`);

  console.log('\n====================================================\n');
}

run().catch(console.error);
