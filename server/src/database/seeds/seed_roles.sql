INSERT INTO roles (name) VALUES
('Fleet Manager'),
('Driver'),
('Safety Officer'),
('Financial Analyst'),
('Dispatcher')
ON CONFLICT (name) DO NOTHING;
