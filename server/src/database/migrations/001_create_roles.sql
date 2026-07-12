CREATE TABLE IF NOT EXISTS roles (
  id   SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL  -- 'Fleet Manager', 'Driver', 'Safety Officer', 'Financial Analyst'
);
