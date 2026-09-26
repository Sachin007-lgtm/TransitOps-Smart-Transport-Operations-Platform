require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function fixColumns() {
  await client.connect();
  try {
    await client.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS region VARCHAR(100);`);
    await client.query(`ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS name VARCHAR(100);`);
    await client.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS advance_received DECIMAL(12, 2) DEFAULT 0.00;`);
    console.log("Successfully added missing columns for dev branch.");
  } catch(e) {
    console.error("Error adding columns:", e);
  }
  await client.end();
}
fixColumns();
