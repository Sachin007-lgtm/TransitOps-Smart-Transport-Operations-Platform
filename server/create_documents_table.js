require('dotenv').config();
const { pool } = require('./src/config/db');

async function run() {
  try {
    const client = await pool.connect();
    console.log('Connected to DB');
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT uuidv7(),
          organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
          entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('DRIVER', 'VEHICLE')),
          entity_id UUID NOT NULL,
          document_type VARCHAR(50) NOT NULL,
          file_url TEXT NOT NULL,
          issue_date DATE,
          expiry_date DATE NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_documents_id_org UNIQUE (id, organization_id),
          CONSTRAINT uq_documents_entity_type UNIQUE (organization_id, entity_type, entity_id, document_type)
      );
      CREATE INDEX IF NOT EXISTS idx_documents_org_entity ON documents(organization_id, entity_type, entity_id);
    `);
    console.log('Documents table created successfully.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
