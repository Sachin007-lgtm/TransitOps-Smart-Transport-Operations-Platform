ALTER TABLE trips ADD COLUMN IF NOT EXISTS loaded_at TIMESTAMPTZ;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS unloaded_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS maintenance_reports (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  trip_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'Routine'
    CHECK (priority IN ('Routine', 'Urgent', 'Critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'Acknowledged', 'Resolved')),
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_reports_trip_org FOREIGN KEY (trip_id, organization_id)
    REFERENCES trips(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_reports_vehicle_org FOREIGN KEY (vehicle_id, organization_id)
    REFERENCES vehicles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_maintenance_reports_driver_org FOREIGN KEY (driver_id, organization_id)
    REFERENCES drivers(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_maintenance_reports_org_status_created
  ON maintenance_reports (organization_id, status, created_at DESC);
