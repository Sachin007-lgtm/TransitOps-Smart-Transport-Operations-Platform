CREATE TABLE IF NOT EXISTS trips (
  id SERIAL PRIMARY KEY,
  source VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE RESTRICT,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE RESTRICT,
  cargo_weight DECIMAL(10, 2) NOT NULL,
  planned_distance DECIMAL(10, 2) NOT NULL,
  actual_distance DECIMAL(10, 2),
  status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Dispatched', 'Completed', 'Cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
