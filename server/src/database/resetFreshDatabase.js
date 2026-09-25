const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function resetFreshDatabase() {
  const connectionString = process.env.DATABASE_URL || '';
  if (!connectionString) {
    console.error('❌ FATAL: DATABASE_URL is not set.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' || process.env.TRANSITOPS_ENV === 'production') {
    console.error('❌ FATAL: Destructive database reset is strictly prohibited in production environments.');
    process.exit(1);
  }

  const url = new URL(connectionString);
  const host = url.hostname;
  const dbName = url.pathname.replace(/^\//, '');
  const isCloud = host.includes('neon.tech') || host.includes('aws') || host.includes('supabase');
  const neonProjectId = host.split('.')[0] || '';

  console.log('============================================================');
  console.log('⚠️  TRANSITOPS DESTRUCTIVE TEST DATABASE RESET CHECK');
  console.log('============================================================');
  console.log(`Target Host:        ${host}`);
  console.log(`Database Name:      ${dbName}`);
  console.log(`Neon Project ID:    ${neonProjectId}`);
  console.log(`Environment:        ${process.env.NODE_ENV || 'development'}`);
  console.log('============================================================');

  if (isCloud) {
    const allowCloud = process.env.ALLOW_NEON_TEST_RESET === 'true';
    const expectedHost = process.env.EXPECTED_DATABASE_HOST;
    const expectedDb = process.env.EXPECTED_DATABASE_NAME;
    const expectedProject = process.env.EXPECTED_NEON_PROJECT_ID;

    if (!allowCloud) {
      console.error('❌ BLOCKED: Cloud database reset rejected. ALLOW_NEON_TEST_RESET=true is required.');
      process.exit(1);
    }

    if (expectedHost && expectedHost !== host) {
      console.error(`❌ BLOCKED: Target host mismatch. Expected '${expectedHost}', but connecting to '${host}'.`);
      process.exit(1);
    }

    if (expectedDb && expectedDb !== dbName) {
      console.error(`❌ BLOCKED: Target database mismatch. Expected '${expectedDb}', but connecting to '${dbName}'.`);
      process.exit(1);
    }

    if (expectedProject && expectedProject !== neonProjectId) {
      console.error(`❌ BLOCKED: Neon project ID mismatch. Expected '${expectedProject}', but connecting to '${neonProjectId}'.`);
      process.exit(1);
    }

    console.log('✅ Multi-factor target verification PASSED for cloud test database.\n');
  } else {
    console.log('✅ Local test database target verified.\n');
  }

  const client = await pool.connect();
  try {
    console.log('🗑️  Dropping existing schema tables in reverse dependency order...');
    await client.query('BEGIN');
    await client.query(`
      DROP TABLE IF EXISTS vehicle_locations CASCADE;
      DROP TABLE IF EXISTS trips CASCADE;
      DROP TABLE IF EXISTS vehicles CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS drivers CASCADE;
      DROP TABLE IF EXISTS roles CASCADE;
      DROP TABLE IF EXISTS organizations CASCADE;
      -- Drop legacy tables if present
      DROP TABLE IF EXISTS maintenance_logs CASCADE;
      DROP TABLE IF EXISTS fuel_logs CASCADE;
      DROP TABLE IF EXISTS expenses CASCADE;
    `);
    await client.query('COMMIT');
    console.log('✅ Clean slate established.\n');

    console.log('🚀 Applying fresh UUID baseline schema...');
    const schemaFile = path.join(__dirname, 'migrations', '001_initial_transitops_schema.sql');
    const schemaSql = fs.readFileSync(schemaFile, 'utf8');
    await client.query(schemaSql);
    console.log('✅ Baseline schema and triggers applied successfully.\n');

    console.log('🌱 Seeding deterministic test data...');
    const seedFile = path.join(__dirname, 'seeds', '001_development_seed.sql');
    if (fs.existsSync(seedFile)) {
      const seedSql = fs.readFileSync(seedFile, 'utf8');
      await client.query(seedSql);
      console.log('✅ Test seed data applied successfully.\n');
    }

    console.log('🎉 Fresh database setup completed safely!');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error during fresh database setup:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  resetFreshDatabase();
}

module.exports = { resetFreshDatabase };
