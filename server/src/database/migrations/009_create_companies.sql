-- Companies (clients) for which transport work (trips) is performed.
-- Bills are generated per company from that company's unbilled trips.
CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(30),
  address TEXT,
  gstin VARCHAR(15),
  -- Money the company already owed before being registered in the system.
  -- Carried into the first bill's previous_balance so the ledger stays true.
  opening_balance DECIMAL(12, 2) DEFAULT 0.00,
  status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
