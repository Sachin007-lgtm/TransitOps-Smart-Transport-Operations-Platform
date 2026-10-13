ALTER TABLE trips ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS dest_lat DOUBLE PRECISION;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS dest_lng DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS trip_milestone_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  trip_id UUID NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('loaded', 'unloaded')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('driver', 'manager_override')),
  user_id UUID,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  distance_m INTEGER,
  override_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_milestone_events_trip_org FOREIGN KEY (trip_id, organization_id)
    REFERENCES trips(id, organization_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_milestone_events_trip
  ON trip_milestone_events (trip_id, created_at);
