INSERT INTO vehicles (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, status, region) VALUES
('REG-001', 'Van-01', 'Van', 500.00, 12000.00, 25000.00, 'Available', 'North'),
('REG-002', 'Van-02', 'Van', 500.00, 15000.00, 25000.00, 'In Shop', 'South'),
('REG-003', 'Truck-01', 'Truck', 3000.00, 45000.00, 65000.00, 'Available', 'East'),
('REG-004', 'Truck-02', 'Truck', 3500.00, 60000.00, 70000.00, 'On Trip', 'West'),
('REG-005', 'Trailer-01', 'Trailer', 10000.00, 120000.00, 110000.00, 'Retired', 'North')
ON CONFLICT (registration_number) DO NOTHING;
