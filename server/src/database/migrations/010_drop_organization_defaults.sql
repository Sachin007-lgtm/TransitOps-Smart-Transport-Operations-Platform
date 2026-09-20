-- 010_drop_organization_defaults.sql

-- Drop active DEFAULT 'org-1' constraints so that PostgreSQL requires
-- explicit tenant context on all new inserts.
-- Retains NOT NULL constraints so inserts omitting organization_id fail fast with code 23502.

ALTER TABLE trips
ALTER COLUMN organization_id DROP DEFAULT;

ALTER TABLE vehicles
ALTER COLUMN organization_id DROP DEFAULT;

ALTER TABLE drivers
ALTER COLUMN organization_id DROP DEFAULT;

ALTER TABLE users
ALTER COLUMN organization_id DROP DEFAULT;
