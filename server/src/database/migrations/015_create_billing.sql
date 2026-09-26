-- 015_create_billing.sql
-- Billing: a company's unbilled completed trips are composed into one bill.
-- Generating a bill snapshots those trips into bill_items (so later edits to
-- a trip never rewrite an issued bill) and marks the trips Billed, which
-- removes them from the unbilled pool. Payments settle the bill.
--
-- Ledger math mirrors the paper bills this system replaces:
--   balance_due      = previous_balance + subtotal - total_advance
--   previous_balance = company.opening_balance + outstanding of prior bills
--
-- Identifiers follow the repo-wide convention: UUID primary keys defaulted
-- with uuidv7() (requires PostgreSQL 18), organization_id and every foreign
-- key as UUID.
--
-- Idempotent: migrate.js re-runs every migration file on each invocation.

-- 1. Trips carry the billing link and the per-trip figures the paper
--    statement's columns need (trip date, fare, advance, rate basis).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS advance_received DECIMAL(12, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rate_basis VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) NOT NULL DEFAULT 'Unbilled';
ALTER TABLE trips ADD COLUMN IF NOT EXISTS bill_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_billing_status_check') THEN
    ALTER TABLE trips ADD CONSTRAINT trips_billing_status_check
      CHECK (billing_status IN ('Unbilled', 'Billed'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_company_id_fkey') THEN
    ALTER TABLE trips ADD CONSTRAINT trips_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Link trips entered before this migration to their company, matching the
--    free-text customer name the same way companies are deduplicated.
UPDATE trips t
SET company_id = c.id
FROM companies c
WHERE t.company_id IS NULL
  AND t.external_party_name IS NOT NULL
  AND c.organization_id = t.organization_id
  AND LOWER(BTRIM(c.name)) = LOWER(BTRIM(t.external_party_name));

-- 3. Trip date defaults to the dispatch date, read in the business's own
--    timezone (a 01:00 IST dispatch must not land on the previous day).
UPDATE trips
SET trip_date = COALESCE(trip_date, (start_time AT TIME ZONE 'Asia/Kolkata')::date, created_at::date)
WHERE trip_date IS NULL;

-- 4. Per-organization consecutive bill numbering. Invoice numbers must not
--    repeat or skip within a tenant, which a global sequence cannot promise.
CREATE TABLE IF NOT EXISTS bill_counters (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE RESTRICT,
  last_number INTEGER NOT NULL DEFAULT 0
);

-- 5. Bills. One row per generated bill, carrying the ledger totals.
CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  bill_no VARCHAR(30) NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Amount already owed by the company when this bill was generated.
  previous_balance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  -- Sum of the fares snapshotted into this bill.
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  -- Sum of per-trip advances already received (the ADVANCE column on the
  -- paper statement bills).
  total_advance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  -- What the company must pay to settle this bill.
  balance_due DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  -- Running total of recorded payments (denormalized from payments).
  amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  status VARCHAR(20) NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bills_org_bill_no_unique UNIQUE (organization_id, bill_no)
);

-- Trips reference their bill. Declared here (not with the other trip columns)
-- because the referenced table must already exist.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_bill_id_fkey') THEN
    ALTER TABLE trips ADD CONSTRAINT trips_bill_id_fkey
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 6. Immutable snapshot of each trip as it was when the bill was issued.
--    Deliberately denormalized: an issued bill must never change because a
--    trip was later edited or deleted.
CREATE TABLE IF NOT EXISTS bill_items (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE SET NULL,
  trip_date DATE,
  origin VARCHAR(255),
  destination VARCHAR(255),
  particulars VARCHAR(500),
  vehicle_registration VARCHAR(50),
  rate_basis VARCHAR(255),
  amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  advance DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Settlement records against a bill (mode + date, as on the paper ledger).
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  mode VARCHAR(30) NOT NULL DEFAULT 'Cash'
    CHECK (mode IN ('Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trips_company_billing ON trips (organization_id, company_id, billing_status);
CREATE INDEX IF NOT EXISTS idx_bills_org_company ON bills (organization_id, company_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments (bill_id);
