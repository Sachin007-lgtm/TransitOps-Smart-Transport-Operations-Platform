INSERT INTO roles (name) VALUES
('Fleet Manager'),
('Driver'),
('Safety Officer'),
('Financial Analyst')
ON CONFLICT (name) DO NOTHING;
