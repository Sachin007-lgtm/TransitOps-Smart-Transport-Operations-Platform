-- 028_in_trip_tracking_and_punctuality.sql
-- Enriches vehicle_locations for offline buffer sync and geofencing.
-- Adds pickup/destination arrival timestamps to trips.
-- Introduces driver punctuality scoring, tracking, and logs.

-- 1. Enrich vehicle_locations table
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS battery_level INTEGER;
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS is_offline_sync BOOLEAN DEFAULT FALSE;
ALTER TABLE vehicle_locations ADD COLUMN IF NOT EXISTS geofence_status VARCHAR(50) DEFAULT 'IN_TRANSIT';

-- 2. Enrich trips table with pickup and destination milestone arrival times
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrived_pickup_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS departed_pickup_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS arrived_dest_at TIMESTAMPTZ;

-- 3. Enrich drivers table with punctuality metrics
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS on_time_rate NUMERIC(5, 2) DEFAULT 100.00;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS punctuality_score NUMERIC(3, 1) DEFAULT 5.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS avg_delay_minutes NUMERIC(6, 1) DEFAULT 0.0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS total_completed_trips INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS on_time_trips_count INTEGER DEFAULT 0;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS late_trips_count INTEGER DEFAULT 0;

-- 4. Driver punctuality and accountability audit log
CREATE TABLE IF NOT EXISTS driver_punctuality_logs (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE RESTRICT,
    trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    scheduled_reporting_time TIMESTAMPTZ,
    actual_reporting_time TIMESTAMPTZ,
    reporting_delay_minutes INTEGER DEFAULT 0,
    is_on_time_reporting BOOLEAN DEFAULT TRUE,
    expected_delivery_time TIMESTAMPTZ,
    actual_delivery_time TIMESTAMPTZ,
    delivery_delay_minutes INTEGER DEFAULT 0,
    is_on_time_delivery BOOLEAN DEFAULT TRUE,
    claimed_eta_minutes INTEGER,
    actual_transit_minutes INTEGER,
    eta_variance_minutes INTEGER,
    trip_punctuality_score NUMERIC(3, 1) DEFAULT 5.0,
    summary_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_punctuality_trip UNIQUE (trip_id)
);

CREATE INDEX IF NOT EXISTS idx_punctuality_driver ON driver_punctuality_logs(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_punctuality_org ON driver_punctuality_logs(organization_id);
