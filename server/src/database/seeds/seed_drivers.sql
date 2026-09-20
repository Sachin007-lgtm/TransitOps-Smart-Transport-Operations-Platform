INSERT INTO drivers (
    name,
    license_number,
    license_category,
    license_expiry_date,
    contact_number,
    safety_score,
    status,
    organization_id
) VALUES

(
    'Alex Kumar',
    'DL-MH-20190001',
    'C',
    '2027-06-30',
    '+91 9876543210',
    95,
    'Available',
    'org-1'
),

(
    'Ravi Sharma',
    'DL-MH-20200045',
    'BE',
    '2026-12-31',
    '+91 9123456780',
    88,
    'Available',
    'org-1'
),

(
    'Priya Nair',
    'DL-KA-20180123',
    'D',
    '2025-03-15',
    '+91 9000012345',
    72,
    'Available',
    'org-1'
)

ON CONFLICT (license_number) DO NOTHING;
