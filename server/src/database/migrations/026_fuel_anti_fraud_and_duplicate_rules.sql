-- Fuel Anti-Fraud & Duplicate Prevention Rules (Migration 026)
--
-- Adds fields to expenses for invoice tracking, receipt photos, fraud flags,
-- and approval workflow. Also adds fuel_tank_capacity to vehicles to catch
-- impossible fill amounts.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'Approved'
    CHECK (approval_status IN ('Approved', 'Under Review', 'Rejected')),
  ADD COLUMN IF NOT EXISTS flag_reasons TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Vehicle fuel tank capacity for sanity checking fill volumes
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS fuel_tank_capacity DECIMAL(8, 2) DEFAULT 300.00;

-- Backfill sensible tank capacities based on vehicle type
UPDATE vehicles
SET fuel_tank_capacity = CASE
  WHEN type ILIKE '%van%' OR type ILIKE '%car%' OR type ILIKE '%pickup%' THEN 70.00
  WHEN type ILIKE '%trailer%' THEN 450.00
  ELSE 300.00
END
WHERE fuel_tank_capacity IS NULL OR fuel_tank_capacity = 300.00;

-- Indices for duplicate invoice lookups and review queue queries
CREATE INDEX IF NOT EXISTS idx_expenses_org_invoice
  ON expenses(organization_id, LOWER(BTRIM(invoice_number)))
  WHERE invoice_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_org_approval
  ON expenses(organization_id, approval_status);
