INSERT INTO vehicles (registration_number, name, type, max_load_capacity, odometer, acquisition_cost, status) VALUES
  ('MH-01-AB-1234', 'Van-01',   'Van',   800.00,  12500.00, 850000.00,  'Available'),
  ('MH-01-AB-5678', 'Truck-01', 'Truck', 5000.00, 42000.00, 2500000.00, 'Available'),
  ('MH-01-AB-9999', 'Van-02',   'Van',   800.00,  3200.00,  850000.00,  'Available')
ON CONFLICT (registration_number) DO NOTHING;
