CREATE TABLE IF NOT EXISTS drivers (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100)  NOT NULL,
  license_number      VARCHAR(100)  UNIQUE NOT NULL,
  license_category    VARCHAR(10)   NOT NULL,
  license_expiry_date DATE          NOT NULL,
  contact_number      VARCHAR(20)   NOT NULL,
  safety_score        INTEGER       NOT NULL DEFAULT 100
                        CHECK (safety_score >= 0 AND safety_score <= 100),
  status              VARCHAR(20)   NOT NULL DEFAULT 'Available'
                        CHECK (status IN ('Available', 'On Trip', 'Off Duty', 'Suspended')),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
