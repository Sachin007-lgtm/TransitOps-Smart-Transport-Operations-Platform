-- Billing: completed trips become billable work for a company; generating a
-- bill snapshots those trips into bill_items (so later trip edits never
-- rewrite an issued bill) and payments settle the bill.
-- Ledger math mirrors the paper bills this system replaces:
--   balance_due = previous_balance + subtotal - total_advance
--   previous_balance = company.opening_balance + outstanding of all prior bills

ALTER TABLE trips ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS trip_date DATE;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS advance_received DECIMAL(12, 2) DEFAULT 0.00;
ALTER TABLE trips ADD COLUMN IF NOT EXISTS rate_basis VARCHAR(255);
ALTER TABLE trips ADD COLUMN IF NOT EXISTS billing_status VARCHAR(20) DEFAULT 'Unbilled' CHECK (billing_status IN ('Unbilled', 'Billed'));
ALTER TABLE trips ADD COLUMN IF NOT EXISTS bill_id INTEGER;

-- Global consecutive bill numbering (Indian tax-invoice practice: numbers
-- must not repeat; a per-run sequence keeps them gapless under normal use).
CREATE SEQUENCE IF NOT EXISTS bill_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  bill_no VARCHAR(20) NOT NULL UNIQUE,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Amount already owed by the company when this bill was generated.
  previous_balance DECIMAL(12, 2) DEFAULT 0.00,
  -- Sum of trip revenues snapshotted into this bill.
  subtotal DECIMAL(12, 2) DEFAULT 0.00,
  -- Sum of per-trip advances already received (the ADVANCE column on the
  -- paper statement bills).
  total_advance DECIMAL(12, 2) DEFAULT 0.00,
  -- What the company must pay to settle this bill: previous + subtotal - advance.
  balance_due DECIMAL(12, 2) DEFAULT 0.00,
  -- Running total of recorded payments (denormalized from payments table).
  amount_paid DECIMAL(12, 2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid')),
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- FK added after bills exists (trips references bills and vice versa via
-- bill_items); guarded so re-running this migration stays idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trips_bill_id_fkey') THEN
    ALTER TABLE trips ADD CONSTRAINT trips_bill_id_fkey
      FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Immutable snapshot of each billed trip at generation time.
CREATE TABLE IF NOT EXISTS bill_items (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
  trip_date DATE,
  source VARCHAR(255),
  destination VARCHAR(255),
  particulars VARCHAR(500),
  vehicle_registration VARCHAR(50),
  rate_basis VARCHAR(255),
  amount DECIMAL(12, 2) DEFAULT 0.00,
  advance DECIMAL(12, 2) DEFAULT 0.00,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Settlement records against a bill (mode + date, as on the paper ledger).
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  mode VARCHAR(30) NOT NULL DEFAULT 'Cash'
    CHECK (mode IN ('Cash', 'UPI', 'NEFT', 'IMPS', 'RTGS', 'Cheque', 'Bank Transfer', 'Other')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trips_company_billing ON trips (company_id, billing_status);
CREATE INDEX IF NOT EXISTS idx_bills_company ON bills (company_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items (bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_bill ON payments (bill_id);
