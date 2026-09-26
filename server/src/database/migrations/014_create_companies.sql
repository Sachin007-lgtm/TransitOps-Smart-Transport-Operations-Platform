-- 014_create_companies.sql
-- Companies (customers / agencies) that transport work is billed to.
-- A bill is generated per company and composes that company's unbilled
-- completed trips, mirroring the paper ledger bills this system replaces
-- (workspace root: AJAY statement format, B-7 ledger format).
--
-- Multi-tenant: a company belongs to exactly one organization, so the same
-- customer name can exist independently under two organizations.
--
-- Identifiers follow the repo-wide convention: UUID primary keys defaulted with
-- uuidv7() (requires PostgreSQL 18), and organization_id as UUID.
--
-- Idempotent: migrate.js re-runs every migration file on each invocation.

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(30),
  address TEXT,
  gstin VARCHAR(15),
  -- Money the company already owed before being registered in the system.
  -- Carried into the first bill's previous_balance so the ledger stays true.
  opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_companies_org ON companies(organization_id);

-- Trip entry captures the customer as free text ("ABC Transport",
-- "abc transport "), so the same customer can arrive spelled differently.
-- Case/whitespace-insensitive uniqueness keeps one customer on one row —
-- otherwise a single company's trips would split across several bills,
-- which defeats the purpose of billing per company.
CREATE UNIQUE INDEX IF NOT EXISTS companies_org_name_unique
  ON companies (organization_id, LOWER(BTRIM(name)));

-- Backfill: every customer name already recorded on a trip becomes a company,
-- so trips created before this migration are billable without re-entry.
-- ON CONFLICT (bare) swallows both the exact and the case-insensitive clash.
INSERT INTO companies (organization_id, name)
SELECT DISTINCT t.organization_id, BTRIM(t.external_party_name)
FROM trips t
WHERE t.external_party_name IS NOT NULL
  AND BTRIM(t.external_party_name) <> ''
ON CONFLICT DO NOTHING;
