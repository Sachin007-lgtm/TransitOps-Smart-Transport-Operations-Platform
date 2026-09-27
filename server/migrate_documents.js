require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Migrating documents table...');

    // Add missing columns that the model expects
    await client.query(`
      ALTER TABLE documents 
        ADD COLUMN IF NOT EXISTS expiry_date DATE,
        ADD COLUMN IF NOT EXISTS issue_date DATE,
        ADD COLUMN IF NOT EXISTS file_url TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);
    console.log('Added missing columns: expiry_date, issue_date, file_url, updated_at');

    // Add the unique constraint needed for upsert ON CONFLICT
    await client.query(`
      ALTER TABLE documents 
        DROP CONSTRAINT IF EXISTS uq_documents_entity_type;
    `);
    await client.query(`
      ALTER TABLE documents
        ADD CONSTRAINT uq_documents_entity_type 
        UNIQUE (organization_id, entity_type, entity_id, document_type);
    `).catch(e => {
      if (e.code === '42P07') {
        console.log('Unique constraint already exists, skipping.');
      } else {
        throw e;
      }
    });
    console.log('Unique constraint ensured.');

    // Backfill file_url from document_url if any rows exist
    await client.query(`
      UPDATE documents SET file_url = document_url WHERE file_url IS NULL AND document_url IS NOT NULL;
    `);
    console.log('Backfilled file_url from document_url.');

    // Add index for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_documents_org_entity ON documents(organization_id, entity_type, entity_id);
    `);
    console.log('Index ensured.');

    console.log('\n✅ Migration complete! documents table is now fully compatible.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
