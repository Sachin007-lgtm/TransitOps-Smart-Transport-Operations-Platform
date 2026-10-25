ALTER TABLE trips ADD COLUMN IF NOT EXISTS scheduled_start_time TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_trips_scheduled_start_time ON trips (organization_id, scheduled_start_time) WHERE scheduled_start_time IS NOT NULL;
