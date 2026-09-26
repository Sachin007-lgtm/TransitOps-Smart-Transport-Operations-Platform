-- 014_create_vehicle_locations.sql

CREATE TABLE IF NOT EXISTS vehicle_locations (
  id BIGSERIAL PRIMARY KEY,
  trip_id INTEGER REFERENCES trips(id) ON DELETE CASCADE,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accuracy DOUBLE PRECISION,
  altitude DOUBLE PRECISION,
  captured_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_locations_trip_captured ON vehicle_locations(trip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_vehicle_captured ON vehicle_locations(vehicle_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_org ON vehicle_locations(organization_id);
