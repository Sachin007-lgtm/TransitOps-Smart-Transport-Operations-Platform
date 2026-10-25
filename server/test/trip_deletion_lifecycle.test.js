const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { query } = require('../src/config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

describe('Trip Deletion Lifecycle: Asset Availability & Billing Safety Tests', () => {
  let server;
  let baseUrl;
  const orgId = 'd0000000-0000-0000-0000-000000000099';
  const managerToken = createToken({
    id: 'u0000000-0000-0000-0000-000000000088',
    email: 'manager@test-deletion.com',
    role: 'Owner/Manager',
    organization_id: orgId
  });

  let vehicleId;
  let driverId;
  let companyId;

  before(async () => {
    await query('BEGIN');
    await query(
      `INSERT INTO organizations (id, name, slug, status) 
       VALUES ($1, 'Test Deletion Org', 'test-deletion-org', 'Active') 
       ON CONFLICT (id) DO NOTHING`,
      [orgId]
    );

    // Create a vehicle
    const vehRes = await query(
      `INSERT INTO vehicles (organization_id, registration_number, type, max_load_capacity, status)
       VALUES ($1, 'GJ-01-DEL-999', 'Truck', 5000, 'Available')
       RETURNING id`,
      [orgId]
    );
    vehicleId = vehRes.rows[0].id;

    // Create a driver
    const drvRes = await query(
      `INSERT INTO drivers (organization_id, name, license_number, license_category, license_expiry_date, contact_number, status)
       VALUES ($1, 'Ramesh Deletion Test', 'LIC-DEL-999', 'HMV / HGMV', '2030-01-01', '+919999999999', 'Available')
       RETURNING id`,
      [orgId]
    );
    driverId = drvRes.rows[0].id;

    // Create a customer/company for billing
    const compRes = await query(
      `INSERT INTO companies (organization_id, name, contact_person, phone, opening_balance)
       VALUES ($1, 'Acme Logistics Ltd', 'John Doe', '+919876543210', 0.00)
       RETURNING id`,
      [orgId]
    );
    companyId = compRes.rows[0].id;

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
    await query('DELETE FROM trip_milestone_events WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM vehicle_locations WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM bills WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM trips WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM companies WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM drivers WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM vehicles WHERE organization_id = $1', [orgId]);
    await query('DELETE FROM organizations WHERE id = $1', [orgId]);
  });

  test('1. Creating an assigned trip reserves the vehicle and driver', async () => {
    const tripRes = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Gandhinagar Depot',
        destination: 'Ahmedabad Hub',
        planned_route: 'Gandhinagar Depot -> Ahmedabad Hub',
        start_time: new Date(Date.now() + 3600000).toISOString(),
        scheduled_start_time: new Date(Date.now() + 3600000).toISOString(),
        vehicle_id: vehicleId,
        driver_id: driverId,
        company_id: companyId,
        revenue: 4500.00,
        status: 'Planned'
      })
    });

    const tripData = await tripRes.json();
    assert.equal(tripRes.status, 201, `Failed to create trip: ${JSON.stringify(tripData)}`);
    const trip1Id = tripData.data.id;

    // Advance to Assigned
    const assignRes = await fetch(`${baseUrl}/trips/${trip1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ status: 'Assigned' })
    });
    assert.equal(assignRes.status, 200, 'Trip should advance to Assigned');

    // Check billing statement preview before deletion: trip should be present
    const statementRes = await fetch(`${baseUrl}/billing/companies/${companyId}/statement`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const statementData = await statementRes.json();
    assert.equal(statementRes.status, 200);
    // Since statuses default to Completed, let's query with statuses=Assigned,Dispatched,Completed
    const previewRes = await fetch(`${baseUrl}/billing/companies/${companyId}/statement?statuses=Draft,Planned,Assigned,Dispatched,Completed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const previewData = await previewRes.json();
    assert.equal(previewRes.status, 200);
    const inPreview = previewData.data.billable.some((t) => t.id === trip1Id);
    assert.equal(inPreview, true, 'Trip should appear in statement preview when Assigned');

    // Attempting to advance another trip to Assigned with the same vehicle/driver should collide
    const conflictTripRes = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Gandhinagar Depot',
        destination: 'Naroda Industrial Area',
        planned_route: 'Gandhinagar Depot -> Naroda Industrial Area',
        start_time: new Date(Date.now() + 7200000).toISOString(),
        vehicle_id: vehicleId,
        driver_id: driverId,
        status: 'Planned'
      })
    });
    const conflictTripData = await conflictTripRes.json();
    assert.equal(conflictTripRes.status, 201, `Failed to create conflict test trip: ${JSON.stringify(conflictTripData)}`);
    const conflictTripId = conflictTripData.data.id;

    const conflictAssignRes = await fetch(`${baseUrl}/trips/${conflictTripId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ status: 'Assigned' })
    });
    assert.equal(conflictAssignRes.status, 409, 'Double-booking vehicle/driver on active assigned trip must be rejected');

    // Clean up temporary collision test trip
    await fetch(`${baseUrl}/trips/${conflictTripId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });

    // 2. Delete the assigned trip
    const deleteRes = await fetch(`${baseUrl}/trips/${trip1Id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(deleteRes.status, 200, 'Assigned trip should delete successfully');

    // 3. Confirm trip no longer exists
    const getDeletedRes = await fetch(`${baseUrl}/trips/${trip1Id}`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    assert.equal(getDeletedRes.status, 404, 'Deleted trip must return 404');

    // 4. Confirm vehicle and driver are immediately available to be assigned to a new trip
    const newTripRes = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({
        origin: 'Sanand Warehouse',
        destination: 'Ahmedabad Hub',
        planned_route: 'Sanand Warehouse -> Ahmedabad Hub',
        start_time: new Date(Date.now() + 3600000).toISOString(),
        vehicle_id: vehicleId,
        driver_id: driverId,
        status: 'Planned'
      })
    });
    const newTripData = await newTripRes.json();
    assert.equal(newTripRes.status, 201, `Vehicle and driver must be available for assignment: ${JSON.stringify(newTripData)}`);

    const newAssignRes = await fetch(`${baseUrl}/trips/${newTripData.data.id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`
      },
      body: JSON.stringify({ status: 'Assigned' })
    });
    assert.equal(newAssignRes.status, 200, 'Re-assigning the released vehicle and driver must succeed with 0 collision');

    // Clean up second trip
    await fetch(`${baseUrl}/trips/${newTripData.data.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${managerToken}` }
    });

    // 5. Confirm billing statement preview has NO trace of the deleted trip
    const cleanStatementRes = await fetch(`${baseUrl}/billing/companies/${companyId}/statement?statuses=Draft,Planned,Assigned,Dispatched,Completed`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const cleanStatementData = await cleanStatementRes.json();
    assert.equal(cleanStatementRes.status, 200);
    const stillInPreview = cleanStatementData.data.billable.some((t) => t.id === trip1Id);
    assert.equal(stillInPreview, false, 'Deleted trip must NOT show up anywhere on the billing page/statement preview');
    assert.equal(cleanStatementData.data.ledger.fares, 0, 'Total billable fares must be 0');
    assert.equal(cleanStatementData.data.ledger.closing_balance, 0, 'Closing balance must be 0');
  });
});
