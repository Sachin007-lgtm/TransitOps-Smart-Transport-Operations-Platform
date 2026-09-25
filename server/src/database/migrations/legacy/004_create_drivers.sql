CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  license_number VARCHAR(50) UNIQUE NOT NULL,
  license_category VARCHAR(50) NOT NULL,
  license_expiry_date DATE NOT NULL,
  contact_number VARCHAR(20) NOT NULL,
  safety_score DECIMAL(5, 2) DEFAULT 100.00 CHECK (safety_score >= 0.00 AND safety_score <= 100.00),
  status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'On Trip', 'Off Duty', 'Suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
