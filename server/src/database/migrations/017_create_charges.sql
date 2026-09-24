-- 017_create_charges.sql
-- Other charges that belong on a customer's statement next to the trips:
-- tolls, loading/unloading, detention, driver allowance, misc.
--
-- They follow the same billing lifecycle as trips (Unbilled -> Billed), which
-- is what makes the "open statement" for a customer simply "everything of this
-- customer that is still unbilled" — trips and charges alike. Nothing has to be
-- kept in sync by hand, and an issued statement can never be half of the work.
--
-- Idempotent: migrate.js re-runs every migration file on each invocation.

CREATE TABLE IF NOT EXISTS charges (
  id SERIAL PRIMARY KEY,
  organization_id VARCHAR(50) NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  -- Optional link to the trip the charge belongs to (e.g. the toll on that run).
  trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'MISC'
    CHECK (kind IN ('TOLL', 'LOADING', 'UNLOADING', 'DETENTION', 'DRIVER_ALLOWANCE', 'MISC')),
  description VARCHAR(255) NOT NULL,
  -- Negative amounts are allowed (a credit or a rate correction); zero is not,
  -- because a zero line on a statement is noise.
  amount DECIMAL(12, 2) NOT NULL CHECK (amount <> 0),
  charge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billing_status VARCHAR(20) NOT NULL DEFAULT 'Unbilled'
    CHECK (billing_status IN ('Unbilled', 'Billed')),
  bill_id INTEGER REFERENCES bills(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charges_company_billing
  ON charges (organization_id, company_id, billing_status);

-- What a statement charges on top of the fares, held on the bill itself so the
-- ledger reads: previous balance + fares + other charges - advances.
ALTER TABLE bills ADD COLUMN IF NOT EXISTS charges_total DECIMAL(12, 2) NOT NULL DEFAULT 0.00;

-- Immutable snapshot of each charge at issue time, like bill_items for trips.
CREATE TABLE IF NOT EXISTS bill_charges (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  charge_id INTEGER REFERENCES charges(id) ON DELETE SET NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'MISC',
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  charge_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bill_charges_bill ON bill_charges (bill_id);
