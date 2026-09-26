require('dotenv').config();
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });

async function fixBills() {
  await client.connect();
  try {
    await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS previous_balance DECIMAL(12, 2) DEFAULT 0.00;`);
    await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS subtotal DECIMAL(12, 2) DEFAULT 0.00;`);
    await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS total_advance DECIMAL(12, 2) DEFAULT 0.00;`);
    await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS balance_due DECIMAL(12, 2) DEFAULT 0.00;`);
    await client.query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12, 2) DEFAULT 0.00;`);
    console.log("Successfully added billing columns.");
  } catch(e) {
    console.error("Error adding billing columns:", e);
  }
  await client.end();
}
fixBills();
