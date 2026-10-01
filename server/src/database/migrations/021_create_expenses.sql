-- Consolidated expense ledger (TransitOps).
--
-- One table for every operating cost instead of the three thin legacy tables
-- (fuel_logs / maintenance_logs / expenses from migrations/legacy, which were
-- never applied on this lineage and predate multi-tenancy). One table means
-- every cost report reads one source and a new cost type adds no migration —
-- the category list carries it.
--
-- Entry model agreed with the owner (2026-09-30): fuel and maintenance are
-- entered office-side by the manager from the bill image, so this table is
-- office-first; a driver mobile path can be layered later. Toll import from a
-- FASTag API is deferred (owner is still pursuing API access) — tolls stay
-- manual until then, both here and as statement charges (migration 017).
--
-- Recover-from-customer: the high-value loop. An expense logged with
-- recovered_charge_id links to the statement charge it was recovered as
-- (migration 017's charges table), so the payable ledger and the customer
-- statement tie out by construction instead of by spreadsheet.

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,

  -- Every cost is the vehicle's cost; the trip link is OPTIONAL because it is
  -- not knowable for a top-up, an insurance payment or a permit renewal
  -- (a tank covers several runs — allocate by distance share in reports,
  -- do not credit one trip).
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,

  category VARCHAR(30) NOT NULL
    CHECK (category IN ('FUEL', 'MAINTENANCE', 'TYRES', 'TOLL', 'INSURANCE',
                        'PERMIT', 'EMI', 'SALARY', 'GARAGE', 'OTHER')),

  description VARCHAR(255) NOT NULL,

  -- Negative amounts are allowed (a credit or a billing correction); zero is
  -- not, because a zero expense line is noise.
  amount DECIMAL(12, 2) NOT NULL CHECK (amount <> 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Fuel-only analytics fields (NULL for every other category). Odometer is
  -- what fuel is missing: with it you get km/l, cost per km and the
  -- mileage-drop signal. Quantity is litres.
  odometer DECIMAL(12, 2),
  quantity DECIMAL(10, 2),
  CONSTRAINT fuel_fields_require_fuel_category CHECK (
    (odometer IS NULL AND quantity IS NULL) OR category = 'FUEL'
  ),

  -- Who the money went to and how it left (mirrors the bills module's modes).
  vendor VARCHAR(120),
  payment_mode VARCHAR(30) NOT NULL DEFAULT 'Cash'
    CHECK (payment_mode IN ('Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque',
                            'Bank Transfer', 'Fuel Card', 'Other')),

  -- The statement charge this cost was recovered as (NULL = not recovered).
  -- Charged expenses may not be deleted or edited in a way that would break
  -- the customer statement — enforced in the service layer.
  recovered_charge_id INTEGER REFERENCES charges(id) ON DELETE SET NULL,

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_expenses_id_org UNIQUE (id, organization_id),
  CONSTRAINT fk_expenses_vehicle_org FOREIGN KEY (vehicle_id, organization_id)
    REFERENCES vehicles(id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT fk_expenses_trip_org FOREIGN KEY (trip_id, organization_id)
    REFERENCES trips(id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_vehicle ON expenses(organization_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_category ON expenses(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON expenses(organization_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_odometer ON expenses(vehicle_id, odometer);

COMMENT ON TABLE expenses IS
  'Consolidated operating-cost ledger: one row per cost (fuel, maintenance, tolls, fixed costs), office-entered from bills. Recovered costs link to statement charges via recovered_charge_id.';
