const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function runSQLFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
}

async function runMigrationsAndSeeds() {
  try {
    console.log('🚀 Starting Database Migrations...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // e.g., 001_create_roles.sql, 002_create_users.sql, etc.

    for (const file of migrationFiles) {
      console.log(`  Applying migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      await runSQLFile(filePath);
    }
    console.log('✅ Database Migrations completed successfully.\n');

    console.log('🌱 Starting Database Seeding...');
    const seedsDir = path.join(__dirname, 'seeds');
    
    // Explicit sequence of seeds to prevent foreign key constraint issues
    const seedFiles = [
      'seed_roles.sql',
      'seed_users.sql',
      'seed_vehicles.sql',
      'seed_drivers.sql'
    ];

    for (const file of seedFiles) {
      console.log(`  Applying seed: ${file}`);
      const filePath = path.join(seedsDir, file);
      if (fs.existsSync(filePath)) {
        await runSQLFile(filePath);
      } else {
        console.warn(`  ⚠️ Seed file ${file} not found, skipping.`);
      }
    }
    console.log('✅ Database Seeding completed successfully.\n');
    console.log('🎉 Database setup is complete!');
    
  } catch (error) {
    console.error('❌ Error during database setup:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrationsAndSeeds();
