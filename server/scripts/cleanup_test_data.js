const { query, pool } = require('../src/config/db');

async function cleanupTestData() {
  console.log('--- Cleaning up trigger and test data from TransitOps DB ---');
  let triggerDisabled = false;
  try {
    // 1. Identify test organizations to remove
    const legitimateOrgIds = [
      '01950000-0001-7000-8000-000000000001', // Apex Freight Logistics
      '01950000-0001-7000-8000-000000000002'  // Beacon Express Lines
    ];

    const testOrgsRes = await query(`
      SELECT id, name, slug FROM organizations
      WHERE id != ALL($1::uuid[])
    `, [legitimateOrgIds]);

    const testOrgIds = testOrgsRes.rows.map(o => o.id);
    console.log(`Found ${testOrgIds.length} test/trigger organizations to remove:`);
    console.table(testOrgsRes.rows);

    // Disable telemetry immutability trigger for cleanup
    await query('ALTER TABLE vehicle_locations DISABLE TRIGGER trg_prevent_telemetry_delete');
    triggerDisabled = true;

    if (testOrgIds.length > 0) {
      // 2. Delete vehicle_locations under test orgs
      const delLocs = await query(`DELETE FROM vehicle_locations WHERE organization_id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delLocs.rowCount} vehicle_locations records.`);

      // 3. Delete trips under test orgs
      const delTrips = await query(`DELETE FROM trips WHERE organization_id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delTrips.rowCount} trips records.`);


      // 7. Delete vehicles under test orgs
      const delVeh = await query(`DELETE FROM vehicles WHERE organization_id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delVeh.rowCount} vehicles records.`);

      // 8. Delete drivers under test orgs
      const delDrv = await query(`DELETE FROM drivers WHERE organization_id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delDrv.rowCount} drivers records.`);

      // 9. Delete users under test orgs
      const delUsers = await query(`DELETE FROM users WHERE organization_id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delUsers.rowCount} users records.`);

      // 10. Delete the test organizations
      const delOrgs = await query(`DELETE FROM organizations WHERE id = ANY($1::uuid[])`, [testOrgIds]);
      console.log(`Deleted ${delOrgs.rowCount} organizations records.`);
    }

    // 11. Delete any orphan test vehicles that might have been created under legitimate orgs during old tests
    const delOrphanVeh = await query(`
      DELETE FROM vehicles 
      WHERE registration_number LIKE 'REG-T-%' 
         OR registration_number LIKE 'REG-ALT-%'
         OR registration_number = 'MH-LOC-01'
    `);
    console.log(`Deleted ${delOrphanVeh.rowCount} orphan test vehicles (REG-T-*, REG-ALT-*, MH-LOC-01).`);

    // 12. Display remaining clean organizations in DB
    const finalOrgs = await query(`
      SELECT o.id, o.name, o.slug, o.status,
             COUNT(DISTINCT v.id)::int AS vehicles_count,
             COUNT(DISTINCT d.id)::int AS drivers_count,
             COUNT(DISTINCT u.id)::int AS users_count
      FROM organizations o
      LEFT JOIN vehicles v ON v.organization_id = o.id
      LEFT JOIN drivers d ON d.organization_id = o.id
      LEFT JOIN users u ON u.organization_id = o.id
      GROUP BY o.id, o.name, o.slug, o.status
      ORDER BY o.name ASC
    `);

    console.log('\n--- Remaining Active Organizations in Platform Registry ---');
    console.table(finalOrgs.rows);

    // 13. Display platform stats
    const statsRes = await query(`
      SELECT 
        (SELECT COUNT(*) FROM organizations)::int AS total_organizations,
        (SELECT COUNT(*) FROM vehicles)::int AS total_vehicles,
        (SELECT COUNT(*) FROM drivers)::int AS total_drivers,
        (SELECT COUNT(*) FROM users)::int AS total_users
    `);
    console.log('\n--- Cleaned Platform Stats ---');
    console.table(statsRes.rows);

    console.log('\nCleanup completed successfully!');
  } catch (err) {
    console.error('Error during cleanup:', err);
    process.exit(1);
  } finally {
    if (triggerDisabled) {
      try {
        await query('ALTER TABLE vehicle_locations ENABLE TRIGGER trg_prevent_telemetry_delete');
        console.log('Re-enabled trg_prevent_telemetry_delete trigger.');
      } catch (err) {
        console.error('Failed to re-enable trigger:', err);
      }
    }
    await pool.end();
  }
}

cleanupTestData();
