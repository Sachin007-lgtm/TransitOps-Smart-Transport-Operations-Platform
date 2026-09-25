const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { query, pool } = require('../src/config/db');

describe('TransitOps Database Trigger Invariant Tests', () => {
  const testOrgA = '10000000-0000-0000-0000-000000000091';
  const testOrgB = '10000000-0000-0000-0000-000000000092';

  let roleAdminId;
  let roleManagerId;
  let roleDriverId;

  let driverAId;
  let vehicleAId;
  let tripAId;
  let locationAId;

  before(async () => {
    // Lookup role UUIDs
    const rolesRes = await query("SELECT id, name FROM roles WHERE name IN ('Platform Admin', 'Owner/Manager', 'Driver')");
    if (rolesRes.rows.length < 3) {
      console.warn('Skipping trigger tests: roles table does not have fresh UUID 3-role schema yet.');
      return;
    }

    roleAdminId = rolesRes.rows.find(r => r.name === 'Platform Admin')?.id;
    roleManagerId = rolesRes.rows.find(r => r.name === 'Owner/Manager')?.id;
    roleDriverId = rolesRes.rows.find(r => r.name === 'Driver')?.id;

    // Seed test organizations
    await query(`
      INSERT INTO organizations (id, name, slug, status)
      VALUES ($1, 'Trigger Test Org A', 'trigger-org-a', 'Active'),
             ($2, 'Trigger Test Org B', 'trigger-org-b', 'Active')
      ON CONFLICT (id) DO NOTHING
    `, [testOrgA, testOrgB]);

    const runId = Date.now();
    const testLicense = `DL-TRIG-${runId}`;
    const testReg = `REG-T-${runId}`;
    const testPhone = `+919999${String(runId).slice(-6)}`;

    // Seed driver in Org A
    const drvRes = await query(`
      INSERT INTO drivers (organization_id, name, license_number, license_category, license_expiry_date, contact_number, status)
      VALUES ($1, 'Trigger Driver A', $2, 'LMV-TR', '2030-01-01', $3, 'Available')
      RETURNING id
    `, [testOrgA, testLicense, testPhone]);
    driverAId = drvRes.rows[0].id;

    // Seed vehicle in Org A
    const vehRes = await query(`
      INSERT INTO vehicles (organization_id, registration_number, type, max_load_capacity, status)
      VALUES ($1, $2, 'Van', 1000, 'Available')
      RETURNING id
    `, [testOrgA, testReg]);
    vehicleAId = vehRes.rows[0].id;

    // Seed trip in Org A
    const tripRes = await query(`
      INSERT INTO trips (organization_id, origin, destination, planned_route, vehicle_id, driver_id, start_time, expected_arrival, status)
      VALUES ($1, 'Point A', 'Point B', 'Route A-B', $2, $3, NOW(), NOW() + INTERVAL '2 hours', 'Assigned')
      RETURNING id
    `, [testOrgA, vehicleAId, driverAId]);
    tripAId = tripRes.rows[0].id;

    // Seed initial telemetry location
    const locRes = await query(`
      INSERT INTO vehicle_locations (organization_id, trip_id, vehicle_id, driver_id, latitude, longitude, captured_at)
      VALUES ($1, $2, $3, $4, 19.0760, 72.8777, NOW())
      RETURNING id
    `, [testOrgA, tripAId, vehicleAId, driverAId]);
    locationAId = locRes.rows[0].id;
  });

  after(async () => {
    // Note: vehicle_locations cannot be deleted directly due to prevent_telemetry_deletion trigger!
    // Tables will be cleaned on full database teardown / schema recreate.
  });

  // ==================== TELEMETRY IMMUTABILITY ====================
  test('1. Trigger rejects direct SQL UPDATE on vehicle_locations (append-only enforcement)', async () => {
    if (!locationAId) return;

    await assert.rejects(
      async () => {
        await query(`
          UPDATE vehicle_locations
          SET latitude = 20.0000
          WHERE id = $1
        `, [locationAId]);
      },
      (err) => {
        assert.match(err.message, /strictly append-only and cannot be updated/i);
        return true;
      }
    );
  });

  test('2. Trigger rejects direct SQL DELETE on vehicle_locations (immutable historical record)', async () => {
    if (!locationAId) return;

    await assert.rejects(
      async () => {
        await query(`
          DELETE FROM vehicle_locations
          WHERE id = $1
        `, [locationAId]);
      },
      (err) => {
        assert.match(err.message, /immutable historical records and cannot be deleted/i);
        return true;
      }
    );
  });

  // ==================== TRIP REASSIGNMENT PROTECTION ====================
  test('3. Trigger blocks vehicle reassignment on trip when telemetry already exists', async () => {
    if (!tripAId) return;

    // Seed alternate vehicle in Org A
    const altVeh = await query(`
      INSERT INTO vehicles (organization_id, registration_number, type, max_load_capacity, status)
      VALUES ($1, $2, 'Van', 1000, 'Available')
      RETURNING id
    `, [testOrgA, `REG-ALT-${Date.now()}`]);
    const altVehId = altVeh.rows[0].id;

    await assert.rejects(
      async () => {
        await query(`
          UPDATE trips
          SET vehicle_id = $1
          WHERE id = $2
        `, [altVehId, tripAId]);
      },
      (err) => {
        assert.match(err.message, /telemetry record\(s\) already exist/i);
        return true;
      }
    );
  });

  test('4. Trigger blocks reassignment when trip status is changed to Completed in the same statement', async () => {
    if (!tripAId) return;

    // Seed a new trip without telemetry
    const newTrip = await query(`
      INSERT INTO trips (organization_id, origin, destination, planned_route, vehicle_id, driver_id, start_time, expected_arrival, status)
      VALUES ($1, 'Point C', 'Point D', 'Route C-D', $2, $3, NOW(), NOW() + INTERVAL '2 hours', 'Planned')
      RETURNING id
    `, [testOrgA, vehicleAId, driverAId]);
    const newTripId = newTrip.rows[0].id;

    const altRunId = Date.now();
    // Seed alternate driver in Org A
    const altDrv = await query(`
      INSERT INTO drivers (organization_id, name, license_number, license_category, license_expiry_date, contact_number, status)
      VALUES ($1, 'Trigger Driver 2', $2, 'LMV-TR', '2030-01-01', $3, 'Available')
      RETURNING id
    `, [testOrgA, `DL-ALT-${altRunId}`, `+919998${String(altRunId).slice(-6)}`]);
    const altDrvId = altDrv.rows[0].id;

    // Attempt to reassign driver AND set status to Completed in the same statement
    await assert.rejects(
      async () => {
        await query(`
          UPDATE trips
          SET driver_id = $1, status = 'Completed'
          WHERE id = $2
        `, [altDrvId, newTripId]);
      },
      (err) => {
        assert.match(err.message, /Cannot reassign vehicle or driver for finalized trip/i);
        return true;
      }
    );
  });

  // ==================== USER ROLE INVARIANTS ====================
  test('5. Trigger rejects Platform Admin creation with non-null organization_id', async () => {
    if (!roleAdminId) return;

    await assert.rejects(
      async () => {
        await query(`
          INSERT INTO users (name, email, password_hash, role_id, organization_id)
          VALUES ('Rogue Admin', 'rogue@admin.com', 'hash', $1, $2)
        `, [roleAdminId, testOrgA]);
      },
      (err) => {
        assert.match(err.message, /Platform Admin cannot belong to an organization/i);
        return true;
      }
    );
  });

  test('6. Trigger rejects Owner/Manager creation without organization_id', async () => {
    if (!roleManagerId) return;

    await assert.rejects(
      async () => {
        await query(`
          INSERT INTO users (name, email, password_hash, role_id, organization_id)
          VALUES ('Orphan Manager', 'orphan@manager.com', 'hash', $1, NULL)
        `, [roleManagerId]);
      },
      (err) => {
        assert.match(err.message, /Owner\/Manager must belong to an organization/i);
        return true;
      }
    );
  });

  test('7. Trigger rejects Driver account without linked driver profile', async () => {
    if (!roleDriverId) return;

    await assert.rejects(
      async () => {
        await query(`
          INSERT INTO users (name, phone_number, password_hash, role_id, organization_id, driver_id)
          VALUES ('Unlinked Driver', '+919999911111', 'hash', $1, $2, NULL)
        `, [roleDriverId, testOrgA]);
      },
      (err) => {
        assert.match(err.message, /Driver account must be linked to a driver profile/i);
        return true;
      }
    );
  });

  // ==================== LOCATION TRIP CONSISTENCY ====================
  test('8. Trigger rejects location insert if vehicle does not match assigned trip vehicle', async () => {
    if (!tripAId) return;

    // Alternate vehicle in Org A
    const altVeh = await query(`
      INSERT INTO vehicles (organization_id, registration_number, type, max_load_capacity, status)
      VALUES ($1, $2, 'Van', 1000, 'Available')
      RETURNING id
    `, [testOrgA, `REG-ALT-${Date.now()}`]);
    const mismatchedVehId = altVeh.rows[0].id;

    await assert.rejects(
      async () => {
        await query(`
          INSERT INTO vehicle_locations (organization_id, trip_id, vehicle_id, driver_id, latitude, longitude, captured_at)
          VALUES ($1, $2, $3, $4, 19.0765, 72.8780, NOW())
        `, [testOrgA, tripAId, mismatchedVehId, driverAId]);
      },
      (err) => {
        assert.match(err.message, /Location vehicle does not match assigned trip vehicle/i);
        return true;
      }
    );
  });
});
