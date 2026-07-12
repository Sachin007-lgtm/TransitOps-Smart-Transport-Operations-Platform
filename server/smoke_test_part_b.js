require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 5001;
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
      port: PORT,
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
  console.log('\n========== TransitOps Final Check Smoke Tests ==========\n');

  // 1. Login (Seeded Fleet Manager)
  let r = await request('POST', '/auth/login', { email: 'fleet@transitops.com', password: 'password123' });
  TOKEN = r.body.data?.token;
  console.log(`[1] Login (Fleet Manager)   → Status: ${r.status} ${TOKEN ? '✅' : '❌'}`);
  if (!TOKEN) {
    console.error('Login failed! Skipping further tests.', r.body);
    return;
  }

  // 2. Setup (Create Vehicle & Driver)
  r = await request('POST', '/vehicles', { 
    registration_number: 'TEST-VAL-001', name: 'Delivery Van', type: 'Van', max_load_capacity: 800, odometer: 10000, acquisition_cost: 30000, region: 'North' 
  }, TOKEN);
  vehicleId = r.body.data?.id;
  
  r = await request('POST', '/drivers', { 
    name: 'Sarah Connor', license_number: 'DL-VAL-888', license_category: 'B', license_expiry_date: '2029-05-15', contact_number: '9876543210' 
  }, TOKEN);
  driverId = r.body.data?.id;
  console.log(`[2] Setup Vehicle/Driver    → Status: ${r.status} ${vehicleId && driverId ? '✅' : '❌'}`);

  // 3. Create Trip (Draft)
  r = await request('POST', '/trips', { 
    source: 'Warehouse X', destination: 'Outlet Y', vehicle_id: vehicleId, driver_id: driverId, cargo_weight: 450, planned_distance: 120 
  }, TOKEN);
  tripId = r.body.data?.id;
  console.log(`[3] POST /trips (Draft)     → Status: ${r.status} ${r.body.data?.status === 'Draft' ? '✅' : '❌'}`);

  // 4. Over-capacity verification
  r = await request('POST', '/trips', { 
    source: 'Warehouse X', destination: 'Outlet Y', vehicle_id: vehicleId, driver_id: driverId, cargo_weight: 1200, planned_distance: 120 
  }, TOKEN);
  console.log(`[4] Over-capacity check     → Status: ${r.status} ${r.status === 400 ? '✅ Reverted Overweight' : '❌'}`);

  // 5. Dispatch Trip
  r = await request('PUT', `/trips/${tripId}`, { status: 'Dispatched' }, TOKEN);
  console.log(`[5] PUT /trips (Dispatch)   → Status: ${r.status} ${r.body.data?.status === 'Dispatched' ? '✅' : '❌'}`);

  // 5b. Verify Vehicle Status changes to 'On Trip'
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  console.log(`[5b] Verify Vehicle Status  → Status: ${r.status} ${r.body.data?.status === 'On Trip' ? '✅ On Trip' : '❌'}`);

  // 6. Complete Trip
  r = await request('PUT', `/trips/${tripId}`, { status: 'Completed', actual_distance: 125, revenue: 500 }, TOKEN);
  console.log(`[6] PUT /trips (Complete)   → Status: ${r.status} ${r.body.data?.status === 'Completed' ? '✅' : '❌'}`);

  // 6b. Verify Odometer and Vehicle Status changes back to 'Available'
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  const odometerSuccess = Number(r.body.data?.odometer) === 10125;
  console.log(`[6b] Verify Vehicle Revert  → Status: ${r.status} ${r.body.data?.status === 'Available' && odometerSuccess ? '✅ Available & Odometer updated' : '❌'}`);

  // 7. Create Maintenance Log (In Shop)
  r = await request('POST', '/maintenance', { vehicle_id: vehicleId, description: 'Periodic Engine Tuning', cost: 350 }, TOKEN);
  maintenanceId = r.body.data?.id;
  console.log(`[7] POST /maintenance       → Status: ${r.status} ${r.body.data?.status === 'Active' ? '✅' : '❌'}`);

  // 7b. Verify Vehicle is 'In Shop'
  r = await request('GET', `/vehicles/${vehicleId}`, null, TOKEN);
  console.log(`[7b] Verify Vehicle Status  → Status: ${r.status} ${r.body.data?.status === 'In Shop' ? '✅ In Shop' : '❌'}`);

  // 8. Close Maintenance
  r = await request('PUT', `/maintenance/${maintenanceId}`, { status: 'Closed' }, TOKEN);
  console.log(`[8] PUT /maintenance        → Status: ${r.status} ${r.body.data?.status === 'Closed' ? '✅' : '❌'}`);

  // 9. Create Fuel & Expense Records
  r = await request('POST', '/fuel', { vehicle_id: vehicleId, trip_id: tripId, liters: 50, cost: 120 }, TOKEN);
  fuelId = r.body.data?.id;
  r = await request('POST', '/expenses', { vehicle_id: vehicleId, trip_id: tripId, description: 'Toll fees', amount: 30 }, TOKEN);
  expenseId = r.body.data?.id;
  console.log(`[9] Log Fuel & Expenses     → Fuel Status: ${fuelId ? '✅' : '❌'} Expense Status: ${expenseId ? '✅' : '❌'}`);

  // 10. Dashboard API
  r = await request('GET', '/reports/dashboard', null, TOKEN);
  console.log(`[10] GET reports/dashboard  → Status: ${r.status} ${r.body.success ? '✅ Net Profit: ' + r.body.data.financials.net_profit : '❌'}`);

  // 11. Detailed Report APIs
  r = await request('GET', '/reports/fuel-efficiency', null, TOKEN);
  const gotFuelRep = r.body.success && Array.isArray(r.body.data);
  r = await request('GET', '/reports/fleet-utilization', null, TOKEN);
  const gotUtilRep = r.body.success && r.body.data.fleet_utilization_percentage !== undefined;
  r = await request('GET', '/reports/operational-cost', null, TOKEN);
  const gotCostRep = r.body.success && Array.isArray(r.body.data);
  r = await request('GET', '/reports/vehicle-roi', null, TOKEN);
  const gotRoiRep = r.body.success && Array.isArray(r.body.data);
  console.log(`[11] GET Detailed Reports   → Fuel: ${gotFuelRep ? '✅' : '❌'} Util: ${gotUtilRep ? '✅' : '❌'} Cost: ${gotCostRep ? '✅' : '❌'} ROI: ${gotRoiRep ? '✅' : '❌'}`);

  // 12. CSV Export
  r = await request('GET', '/reports/export?type=fuel-efficiency', null, TOKEN);
  const isCSV = typeof r.body === 'string' && r.body.includes('registration_number,name,type');
  console.log(`[12] GET reports/export (CSV)→ Status: ${r.status} ${isCSV ? '✅' : '❌'}`);

  // Cleanup
  console.log('\nCleaning up test records...');
  if (expenseId) await request('DELETE', `/expenses/${expenseId}`, null, TOKEN);
  if (fuelId) await request('DELETE', `/fuel/${fuelId}`, null, TOKEN);
  if (maintenanceId) await request('DELETE', `/maintenance/${maintenanceId}`, null, TOKEN);
  if (tripId) await request('DELETE', `/trips/${tripId}`, null, TOKEN);
  if (vehicleId) await request('DELETE', `/vehicles/${vehicleId}`, null, TOKEN);
  if (driverId) await request('DELETE', `/drivers/${driverId}`, null, TOKEN);
  console.log('Cleanup completed successfully. ✅');

  console.log('\n========================================================\n');
}

run().catch(console.error);
