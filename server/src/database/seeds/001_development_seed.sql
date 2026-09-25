-- 001_development_seed.sql
-- Deterministic Development Seed Data for TransitOps (RFC 9562 UUIDv7 Standard)

-- 1. Insert Canonical Roles
INSERT INTO roles (id, name) VALUES
('01950000-0000-7000-8000-000000000001', 'Platform Admin'),
('01950000-0000-7000-8000-000000000002', 'Owner/Manager'),
('01950000-0000-7000-8000-000000000003', 'Driver')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Organizations
INSERT INTO organizations (id, name, slug, status) VALUES
('01950000-0001-7000-8000-000000000001', 'Apex Freight Logistics', 'apex-freight', 'Active'),
('01950000-0001-7000-8000-000000000002', 'Beacon Express Lines', 'beacon-express', 'Active')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Drivers (safety_score removed, dynamic trips_count computed from completed trips)
INSERT INTO drivers (
    id, organization_id, name, license_number, license_category,
    license_expiry_date, contact_number, status
) VALUES
(
    '01950000-0002-7000-8000-000000000001',
    '01950000-0001-7000-8000-000000000001',
    'Alex Kumar',
    'DL-01-2019-0000001',
    'LMV-TR',
    '2028-06-30',
    '+919876543210',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000002',
    '01950000-0001-7000-8000-000000000001',
    'Ravi Sharma',
    'MH-02-2020-0000045',
    'HMV / HGMV',
    '2027-12-31',
    '+919123456780',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000002',
    'Priya Nair',
    'KA-03-2018-0000123',
    'LMV-TR',
    '2026-03-15',
    '+919000012345',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000004',
    '01950000-0001-7000-8000-000000000001',
    'Vikram Singh',
    'DL-04-2021-0000189',
    'HMV / HGMV',
    '2028-09-15',
    '+919811223344',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000005',
    '01950000-0001-7000-8000-000000000001',
    'Sunita Patil',
    'MH-12-2022-0000301',
    'LMV-TR',
    '2029-04-20',
    '+919822334455',
    'Off Duty'
),
(
    '01950000-0002-7000-8000-000000000006',
    '01950000-0001-7000-8000-000000000001',
    'Mohammed Irfan',
    'KA-01-2020-0000542',
    'Trailer',
    '2027-11-10',
    '+919833445566',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000007',
    '01950000-0001-7000-8000-000000000001',
    'Arjun Reddy',
    'TS-09-2023-0000778',
    'HPMV / HTV',
    '2029-08-05',
    '+919844556677',
    'Available'
),
(
    '01950000-0002-7000-8000-000000000008',
    '01950000-0001-7000-8000-000000000001',
    'Rajesh Verma',
    'UP-32-2019-0000912',
    'MGV',
    '2027-02-28',
    '+919855667788',
    'Suspended'
),
(
    '01950000-0002-7000-8000-000000000009',
    '01950000-0001-7000-8000-000000000001',
    'Manoj Tiwari',
    'DL-08-2018-0000431',
    'LMV-NT',
    '2026-10-18',
    '+919866778899',
    'Off Duty'
),
(
    '01950000-0002-7000-8000-000000000010',
    '01950000-0001-7000-8000-000000000002',
    'Suresh Menon',
    'KL-07-2021-0000654',
    'HMV / HGMV',
    '2028-05-12',
    '+919700012345',
    'Available'
)
ON CONFLICT (id) DO UPDATE SET
    license_number = EXCLUDED.license_number,
    license_category = EXCLUDED.license_category,
    license_expiry_date = EXCLUDED.license_expiry_date,
    contact_number = EXCLUDED.contact_number,
    status = EXCLUDED.status;

-- 4. Insert Users (Password: Password123! -> bcrypt $2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy)
INSERT INTO users (
    id, name, email, phone_number, password_hash, role_id,
    organization_id, driver_id, must_change_password, is_active
) VALUES
-- Platform Admin (org_id = NULL, driver_id = NULL)
(
    '01950000-000a-7000-8000-000000000001',
    'Platform Administrator',
    'admin@transitops.com',
    NULL,
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000001',
    NULL,
    NULL,
    FALSE,
    TRUE
),
-- Apex Owner/Manager (org_id = Apex Freight, driver_id = NULL)
(
    '01950000-000a-7000-8000-000000000002',
    'Jane Doe (Apex)',
    'owner@apexfreight.com',
    '+919876500001',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000002',
    '01950000-0001-7000-8000-000000000001',
    NULL,
    FALSE,
    TRUE
),
-- Beacon Owner/Manager (org_id = Beacon Express, driver_id = NULL)
(
    '01950000-000a-7000-8000-000000000003',
    'Bob Miller (Beacon)',
    'owner@beaconexpress.com',
    '+919876500002',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000002',
    '01950000-0001-7000-8000-000000000002',
    NULL,
    FALSE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Alex Kumar)
(
    '01950000-000a-7000-8000-000000000004',
    'Alex Kumar',
    'alex@apexfreight.com',
    '+919876543210',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000001',
    FALSE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Ravi Sharma)
(
    '01950000-000a-7000-8000-000000000005',
    'Ravi Sharma',
    'ravi@apexfreight.com',
    '+919123456780',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000002',
    FALSE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Vikram Singh)
(
    '01950000-000a-7000-8000-000000000006',
    'Vikram Singh',
    'vikram@apexfreight.com',
    '+919811223344',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000004',
    TRUE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Sunita Patil)
(
    '01950000-000a-7000-8000-000000000007',
    'Sunita Patil',
    'sunita@apexfreight.com',
    '+919822334455',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000005',
    FALSE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Mohammed Irfan)
(
    '01950000-000a-7000-8000-000000000008',
    'Mohammed Irfan',
    'irfan@apexfreight.com',
    '+919833445566',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000006',
    FALSE,
    TRUE
),
-- Driver User (Beacon Express, driver_id = Priya Nair)
(
    '01950000-000a-7000-8000-000000000009',
    'Priya Nair',
    'priya@beaconexpress.com',
    '+919000012345',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '01950000-0000-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000002',
    '01950000-0002-7000-8000-000000000003',
    FALSE,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Vehicles (Standard Indian Number Plates SS-RR-XX-NNNN)
INSERT INTO vehicles (
    id, organization_id, registration_number, name, type,
    sub_category, region, max_load_capacity, odometer, acquisition_cost, status
) VALUES
-- Apex Freight Logistics Vehicles (org_id = 01950000-0001-7000-8000-000000000001)
(
    '01950000-0003-7000-8000-000000000001',
    '01950000-0001-7000-8000-000000000001',
    'MH-01-AB-1234',
    'MH-01-AB-1234',
    'Van',
    'Medium (14ft)',
    'Medium (14ft)',
    1500.00,
    12500.00,
    25000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000002',
    '01950000-0001-7000-8000-000000000001',
    'MH-02-CD-5678',
    'MH-02-CD-5678',
    'Truck',
    'Heavy (24ft)',
    'Heavy (24ft)',
    7500.00,
    42000.00,
    65000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000004',
    '01950000-0001-7000-8000-000000000001',
    'DL-04-EF-9012',
    'DL-04-EF-9012',
    'Truck',
    'Heavy (24ft)',
    'Heavy (24ft)',
    8000.00,
    31200.00,
    70000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000005',
    '01950000-0001-7000-8000-000000000001',
    'MH-12-GH-3456',
    'MH-12-GH-3456',
    'Mini',
    'Small (8ft)',
    'Small (8ft)',
    800.00,
    8400.00,
    18000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000006',
    '01950000-0001-7000-8000-000000000001',
    'KA-01-JK-7890',
    'KA-01-JK-7890',
    'Trailer',
    'Extra Heavy (32ft)',
    'Extra Heavy (32ft)',
    24000.00,
    64500.00,
    120000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000007',
    '01950000-0001-7000-8000-000000000001',
    'TS-09-LM-2345',
    'TS-09-LM-2345',
    'Truck',
    'Heavy (24ft)',
    'Heavy (24ft)',
    6500.00,
    27800.00,
    55000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000008',
    '01950000-0001-7000-8000-000000000001',
    'GJ-01-NP-6789',
    'GJ-01-NP-6789',
    'Van',
    'Medium (14ft)',
    'Medium (14ft)',
    1800.00,
    19200.00,
    30000.00,
    'Available'
),
-- Beacon Express Vehicles (org_id = 01950000-0001-7000-8000-000000000002)
(
    '01950000-0003-7000-8000-000000000003',
    '01950000-0001-7000-8000-000000000002',
    'KL-07-PQ-4567',
    'KL-07-PQ-4567',
    'Van',
    'Medium (14ft)',
    'Medium (14ft)',
    1200.00,
    15000.00,
    28000.00,
    'Available'
),
(
    '01950000-0003-7000-8000-000000000009',
    '01950000-0001-7000-8000-000000000002',
    'TN-02-RS-8901',
    'TN-02-RS-8901',
    'Truck',
    'Heavy (24ft)',
    'Heavy (24ft)',
    7000.00,
    38000.00,
    62000.00,
    'Available'
)
ON CONFLICT (id) DO UPDATE SET
    registration_number = EXCLUDED.registration_number,
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    sub_category = EXCLUDED.sub_category,
    region = EXCLUDED.region,
    max_load_capacity = EXCLUDED.max_load_capacity,
    odometer = EXCLUDED.odometer,
    acquisition_cost = EXCLUDED.acquisition_cost,
    status = EXCLUDED.status;

-- 6. Insert Trips
INSERT INTO trips (
    id, organization_id, origin, destination, planned_route,
    vehicle_id, driver_id, cargo_weight, planned_distance, revenue,
    start_time, expected_arrival, status
) VALUES
(
    '01950000-0004-7000-8000-000000000001',
    '01950000-0001-7000-8000-000000000001',
    'Mumbai Hub',
    'Pune Depot',
    'Mumbai Express Highway -> Pune Bypass',
    '01950000-0003-7000-8000-000000000001',
    '01950000-0002-7000-8000-000000000001',
    350.00,
    148.50,
    7500.00,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '4 hours',
    'Assigned'
)
ON CONFLICT (id) DO NOTHING;
