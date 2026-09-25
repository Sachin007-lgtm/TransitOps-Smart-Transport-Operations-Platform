INSERT INTO vehicles (
    registration_number,
    type,
    size,
    max_load_capacity,
    odometer,
    status,
    organization_id
) VALUES

(
    'REG-001',
    'Van',
    'Standard',
    500.00,
    12000.00,
    'Available',
    'org-1'
),

(
    'REG-002',
    'Van',
    'Standard',
    500.00,
    15000.00,
    'In Shop',
    'org-1'
),

(
    'REG-003',
    'Truck',
    'Standard',
    3000.00,
    45000.00,
    'Available',
    'org-1'
),

(
    'REG-004',
    'Truck',
    'Standard',
    3500.00,
    60000.00,
    'On Trip',
    'org-1'
),

(
    'REG-005',
    'Trailer',
    'Standard',
    10000.00,
    120000.00,
    'Retired',
    'org-1'
)

ON CONFLICT (registration_number) DO NOTHING;

