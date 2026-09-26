const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function runSQLFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
}

async function runMigrations() {
  try {
    console.log('🚀 Running Database Migrations...');
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      console.log(`  Applying: ${file}`);
      const filePath = path.join(migrationsDir, file);
      await runSQLFile(filePath);
    }
    console.log('✅ Migrations applied successfully.\n');
  } catch (error) {
    console.error('❌ Error during migrations:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
