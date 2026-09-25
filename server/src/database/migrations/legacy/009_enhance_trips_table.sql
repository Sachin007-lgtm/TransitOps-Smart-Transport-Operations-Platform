-- 009_enhance_trips_table.sql

-- 1. Ensure multi-tenant organization_id on vehicles, drivers, and users
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'vehicles' AND column_name = 'organization_id') THEN
    ALTER TABLE vehicles ADD COLUMN organization_id VARCHAR(50) NOT NULL DEFAULT 'org-1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'organization_id') THEN
    ALTER TABLE drivers ADD COLUMN organization_id VARCHAR(50) NOT NULL DEFAULT 'org-1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'organization_id') THEN
    ALTER TABLE users ADD COLUMN organization_id VARCHAR(50) NOT NULL DEFAULT 'org-1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'driver_id') THEN
    ALTER TABLE users ADD COLUMN driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Rename legacy 'source' column to canonical 'origin' if needed
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'source')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'trips' AND column_name = 'origin') THEN
    ALTER TABLE trips RENAME COLUMN source TO origin;
  END IF;
END $$;

-- 3. Add enhanced operational fields to trips table
ALTER TABLE trips ADD COLUMN IF NOT EXISTS external_party_name VARCHAR(150);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS external_party_type VARCHAR(20) CHECK (external_party_type IN ('CUSTOMER', 'AGENCY'));

ALTER TABLE trips ADD COLUMN IF NOT EXISTS planned_route TEXT;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS start_time TIMESTAMP WITH TIME ZONE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS expected_arrival TIMESTAMP WITH TIME ZONE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS actual_arrival TIMESTAMP WITH TIME ZONE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS organization_id VARCHAR(50) NOT NULL DEFAULT 'org-1';

-- 4. Backfill existing legacy rows with sensible non-null baseline data
UPDATE trips 
SET 
  planned_route = COALESCE(planned_route, 'Standard Direct Route'),
  start_time = COALESCE(start_time, created_at, CURRENT_TIMESTAMP),
  expected_arrival = COALESCE(expected_arrival, created_at + INTERVAL '4 hours', CURRENT_TIMESTAMP + INTERVAL '4 hours'),
  organization_id = COALESCE(organization_id, 'org-1')
WHERE planned_route IS NULL OR start_time IS NULL OR expected_arrival IS NULL;

-- Make mandatory operational fields NOT NULL
ALTER TABLE trips ALTER COLUMN planned_route SET NOT NULL;
ALTER TABLE trips ALTER COLUMN start_time SET NOT NULL;
ALTER TABLE trips ALTER COLUMN expected_arrival SET NOT NULL;

-- 5. Update Status CHECK constraint to controlled 6-state lifecycle
DO $$
BEGIN
  ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
  ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed', 'Cancelled'));
END $$;

-- 6. Add indexes for performance & isolation
CREATE INDEX IF NOT EXISTS idx_trips_org_status ON trips(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);
CREATE INDEX IF NOT EXISTS idx_trips_schedule ON trips(start_time, expected_arrival);
CREATE INDEX IF NOT EXISTS idx_vehicles_org ON vehicles(organization_id);
CREATE INDEX IF NOT EXISTS idx_drivers_org ON drivers(organization_id);
