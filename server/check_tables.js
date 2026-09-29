require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'documents' ORDER BY ordinal_position;"
    );
    if (res.rows.length === 0) {
      console.log('ERROR: documents table does NOT exist!');
    } else {
      console.log('documents table columns:');
      res.rows.forEach(r => console.log(`  - ${r.column_name} (${r.data_type})`));
    }
  } finally {
    client.release();
    await pool.end();
  }
}
check().catch(console.error);
