-- 025_billing_ageing_and_credit_limit.sql
-- Adds two features to the billing system:
-- 1. credit_limit on companies: a ceiling on how much a client may owe before
--    the manager is warned before creating another trip for them.
--    NULL means no limit configured. 0 means effectively blocked.
-- 2. due_date on bills: the date payment is expected by. Drives the ageing
--    buckets (0-15, 16-30, 31-60, 60+ days overdue) shown on the new
--    receivables ageing report.
--
-- Ageing is computed at query time from due_date so it stays live without a
-- scheduled job. For bills issued before this migration, due_date is
-- backfilled to bill_date + 30 days (a common net-30 default).
--
-- Idempotent: migrate.js re-runs every migration file on each invocation.

-- 1. Credit limit on the company master
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12, 2);

COMMENT ON COLUMN companies.credit_limit IS
  'Maximum outstanding balance allowed before new trips should be blocked. NULL = no limit set.';

-- 2. Payment due date on bills
ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS due_date DATE;

COMMENT ON COLUMN bills.due_date IS
  'Date by which payment is expected. Used for ageing buckets on the receivables report.';

-- Backfill: bills with no due_date get net-30 from bill_date.
UPDATE bills
SET due_date = bill_date + INTERVAL '30 days'
WHERE due_date IS NULL;

-- 3. Index that drives the ageing query efficiently:
--    filter by org + live status, order by due_date.
CREATE INDEX IF NOT EXISTS idx_bills_ageing
  ON bills (organization_id, status, due_date)
  WHERE status IN ('Unpaid', 'Partially Paid');
