-- Driver Pre-Trip Availability Checks & ETA Comparison (Migration 027)
--
-- Enables managers to request location pings and availability confirmation
-- from candidate drivers before dispatching. Compares driver-claimed ETA
-- with GPS road network ETA to prevent promising impossible reporting times.

CREATE TABLE IF NOT EXISTS driver_availability_checks (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RESPONDED', 'EXPIRED', 'ASSIGNED', 'REJECTED')),

  -- Driver response & location ping (30-min availability window)
  driver_latitude DECIMAL(10, 7),
  driver_longitude DECIMAL(10, 7),
  driver_accuracy DECIMAL(8, 2),
  driver_location_name VARCHAR(255),
  driver_claimed_minutes INTEGER,
  driver_claimed_eta_text VARCHAR(80),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes'),

  -- Pickup target coordinates
  pickup_latitude DECIMAL(10, 7),
  pickup_longitude DECIMAL(10, 7),

  -- System calculated road distance & ETA
  road_distance_km DECIMAL(8, 2),
  system_eta_minutes INTEGER,
  eta_gap_minutes INTEGER,
  decision_recommendation VARCHAR(30)
    CHECK (decision_recommendation IN ('BEST_OPTION', 'FEASIBLE', 'HIGH_RISK_DELAY')),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_avail_check_org UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_avail_checks_trip ON driver_availability_checks(organization_id, trip_id);
CREATE INDEX IF NOT EXISTS idx_avail_checks_driver ON driver_availability_checks(organization_id, driver_id);
CREATE INDEX IF NOT EXISTS idx_avail_checks_status ON driver_availability_checks(organization_id, status);
