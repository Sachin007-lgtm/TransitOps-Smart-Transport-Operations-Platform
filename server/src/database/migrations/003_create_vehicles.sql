CREATE TABLE IF NOT EXISTS vehicles (
  id                  SERIAL PRIMARY KEY,
  registration_number VARCHAR(50)    UNIQUE NOT NULL,
  name                VARCHAR(150)   NOT NULL,
  type                VARCHAR(50)    NOT NULL,
  max_load_capacity   DECIMAL(10, 2) NOT NULL,
  odometer            DECIMAL(10, 2) NOT NULL DEFAULT 0,
  acquisition_cost    DECIMAL(12, 2) NOT NULL DEFAULT 0,
  status              VARCHAR(20)    NOT NULL DEFAULT 'Available'
                        CHECK (status IN ('Available', 'On Trip', 'In Shop', 'Retired')),
  region              VARCHAR(100),
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
