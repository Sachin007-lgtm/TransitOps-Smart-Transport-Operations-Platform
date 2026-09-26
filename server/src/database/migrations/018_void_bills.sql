-- 018_void_bills.sql
-- Voiding a bill must leave a trace: the row stays, marked Void, with when and
-- why. Erasing it would free the number and leave a permanent, unexplainable
-- gap in a GST invoice series — and destroy the record of what it covered.
--
-- Voided bills drop out of every balance (previous_balance, customer
-- outstanding) because those queries already filter on
-- status IN ('Unpaid', 'Partially Paid'), and remain visible in the bill list
-- with their number, lines and snapshots intact.

-- Widen the status domain (the original CHECK only allowed the three live
-- states). Postgres auto-names the constraint, so find it rather than guess.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'bills'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE bills DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE bills
  ADD CONSTRAINT bills_status_check
  CHECK (status IN ('Unpaid', 'Partially Paid', 'Paid', 'Void'));

ALTER TABLE bills ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS voided_by VARCHAR(150);

-- The bill list is "what this customer owes"; voided rows are history.
CREATE INDEX IF NOT EXISTS idx_bills_org_company_status
  ON bills (organization_id, company_id, status);
