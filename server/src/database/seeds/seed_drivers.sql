INSERT INTO drivers (name, license_number, license_category, license_expiry_date, contact_number, safety_score, status) VALUES
  ('Alex Kumar',   'DL-MH-20190001', 'C',  '2027-06-30', '9876543210', 95, 'Available'),
  ('Ravi Sharma',  'DL-MH-20200045', 'BE', '2026-12-31', '9123456780', 88, 'Available'),
  ('Priya Nair',   'DL-KA-20180123', 'D',  '2025-03-15', '9000012345', 72, 'Available')
ON CONFLICT (license_number) DO NOTHING;
