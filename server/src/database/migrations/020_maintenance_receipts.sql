ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS repair_cost DECIMAL(12, 2)
    CHECK (repair_cost IS NULL OR repair_cost >= 0);

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS receipt_pending BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS receipt_storage_key TEXT;

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS receipt_file_name VARCHAR(255);

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS receipt_mime_type VARCHAR(100);

ALTER TABLE maintenance_reports
  ADD COLUMN IF NOT EXISTS receipt_size_bytes BIGINT;
