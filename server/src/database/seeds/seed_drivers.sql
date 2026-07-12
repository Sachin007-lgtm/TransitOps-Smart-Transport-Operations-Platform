INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status) VALUES
('John Doe', 'DL-1001', 'Class A', '2028-05-15', '1234567890', 95.00, 'Available'),
('Robert Downey', 'DL-1002', 'Class A', '2027-09-20', '2345678901', 98.50, 'On Trip'),
('Alice Cooper', 'DL-1003', 'Class B', '2026-03-01', '3456789012', 88.00, 'Off Duty'),
('David Miller', 'DL-1004', 'Class C', '2029-11-12', '4567890123', 70.00, 'Suspended')
ON CONFLICT (license_number) DO NOTHING;
