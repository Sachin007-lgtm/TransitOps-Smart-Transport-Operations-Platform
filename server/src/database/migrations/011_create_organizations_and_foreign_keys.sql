-- 011_create_organizations_and_foreign_keys.sql

-- 1. Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Discover and backfill all existing non-null organization IDs from users, vehicles, drivers, trips.
-- Ensures every pre-existing organization ID has a parent row in organizations before foreign keys are applied.
-- For existing organization IDs where no organization name is available, uses deterministic placeholder name and slug.
-- If 'org-1' is present, it is mapped to 'Default Development Organization' / 'default-org-1'.
INSERT INTO organizations (id, name, slug, status)
SELECT 
  distinct_orgs.org_id,
  CASE 
    WHEN distinct_orgs.org_id = 'org-1' THEN 'Default Development Organization'
    ELSE 'Organization ' || distinct_orgs.org_id
  END AS name,
  CASE 
    WHEN distinct_orgs.org_id = 'org-1' THEN 'default-org-1'
    ELSE 'org-' || LOWER(REGEXP_REPLACE(distinct_orgs.org_id, '[^a-zA-Z0-9]+', '-', 'g'))
  END AS slug,
  'Active' AS status
FROM (
  SELECT organization_id AS org_id FROM users WHERE organization_id IS NOT NULL
  UNION
  SELECT organization_id AS org_id FROM vehicles WHERE organization_id IS NOT NULL
  UNION
  SELECT organization_id AS org_id FROM drivers WHERE organization_id IS NOT NULL
  UNION
  SELECT organization_id AS org_id FROM trips WHERE organization_id IS NOT NULL
) AS distinct_orgs
ON CONFLICT (id) DO NOTHING;

-- 3. Add foreign keys from users, vehicles, drivers, and trips to organizations(id) with ON DELETE RESTRICT.
-- Wrapped in an idempotent DO block to prevent duplicate constraint errors on repeat execution.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_organization'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT fk_users_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_vehicles_organization'
  ) THEN
    ALTER TABLE vehicles
    ADD CONSTRAINT fk_vehicles_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_drivers_organization'
  ) THEN
    ALTER TABLE drivers
    ADD CONSTRAINT fk_drivers_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_trips_organization'
  ) THEN
    ALTER TABLE trips
    ADD CONSTRAINT fk_trips_organization
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Create index on users(organization_id) for referential integrity lookup performance
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
