-- 001_development_seed.sql
-- Deterministic Development Seed Data for TransitOps

-- 1. Insert Canonical Roles
INSERT INTO roles (id, name) VALUES
('00000000-0000-0000-0000-000000000001', 'Platform Admin'),
('00000000-0000-0000-0000-000000000002', 'Owner/Manager'),
('00000000-0000-0000-0000-000000000003', 'Driver')
ON CONFLICT (name) DO NOTHING;

-- 2. Insert Organizations
INSERT INTO organizations (id, name, slug, status) VALUES
('10000000-0000-0000-0000-000000000001', 'Apex Freight Logistics', 'apex-freight', 'Active'),
('10000000-0000-0000-0000-000000000002', 'Beacon Express Lines', 'beacon-express', 'Active')
ON CONFLICT (id) DO NOTHING;

-- 3. Insert Drivers
INSERT INTO drivers (
    id, organization_id, name, license_number, license_category,
    license_expiry_date, contact_number, safety_score, status
) VALUES
(
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Alex Kumar',
    'DL-MH-20190001',
    'C',
    '2028-06-30',
    '+919876543210',
    95.00,
    'Available'
),
(
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'Ravi Sharma',
    'DL-MH-20200045',
    'BE',
    '2027-12-31',
    '+919123456780',
    88.00,
    'Available'
),
(
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    'Priya Nair',
    'DL-KA-20180123',
    'D',
    '2026-03-15',
    '+919000012345',
    92.00,
    'Available'
)
ON CONFLICT (id) DO NOTHING;

-- 4. Insert Users (Password: Password123! -> bcrypt $2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy)
INSERT INTO users (
    id, name, email, phone_number, password_hash, role_id,
    organization_id, driver_id, must_change_password, is_active
) VALUES
-- Platform Admin (org_id = NULL, driver_id = NULL)
(
    'a0000000-0000-0000-0000-000000000001',
    'Platform Administrator',
    'admin@transitops.com',
    NULL,
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '00000000-0000-0000-0000-000000000001',
    NULL,
    NULL,
    FALSE,
    TRUE
),
-- Apex Owner/Manager (org_id = Apex Freight, driver_id = NULL)
(
    'a0000000-0000-0000-0000-000000000002',
    'Jane Doe (Apex)',
    'owner@apexfreight.com',
    '+919876500001',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    NULL,
    FALSE,
    TRUE
),
-- Beacon Owner/Manager (org_id = Beacon Express, driver_id = NULL)
(
    'a0000000-0000-0000-0000-000000000003',
    'Bob Miller (Beacon)',
    'owner@beaconexpress.com',
    '+919876500002',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '00000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    NULL,
    FALSE,
    TRUE
),
-- Driver User (Apex Freight, driver_id = Alex Kumar)
(
    'a0000000-0000-0000-0000-000000000004',
    'Alex Kumar',
    'driver@apexfreight.com',
    '+919876543210',
    '$2a$12$B9dfUsYfM4aXO0t0qRlhseZjvrvKBdOtluYLPOX3wIyi1LAj6uMpy',
    '00000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    FALSE,
    TRUE
)
ON CONFLICT (id) DO NOTHING;

-- 5. Insert Vehicles
INSERT INTO vehicles (
    id, organization_id, registration_number, name, type,
    sub_category, region, max_load_capacity, odometer, acquisition_cost, status
) VALUES
(
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'REG-APEX-01',
    'Apex Van 1',
    'Van',
    'Standard',
    'North',
    500.00,
    12500.00,
    25000.00,
    'Available'
),
(
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'REG-APEX-02',
    'Apex Heavy 1',
    'Truck',
    'Heavy',
    'South',
    3500.00,
    45000.00,
    65000.00,
    'Available'
),
(
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    'REG-BEACON-01',
    'Beacon Van 1',
    'Van',
    'Standard',
    'East',
    600.00,
    15000.00,
    28000.00,
    'Available'
)
ON CONFLICT (id) DO NOTHING;

-- 6. Insert Trips
INSERT INTO trips (
    id, organization_id, origin, destination, planned_route,
    vehicle_id, driver_id, cargo_weight, planned_distance, revenue,
    start_time, expected_arrival, status
) VALUES
(
    '40000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Mumbai Hub',
    'Pune Depot',
    'Mumbai Express Highway -> Pune Bypass',
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    350.00,
    148.50,
    7500.00,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '4 hours',
    'Assigned'
)
ON CONFLICT (id) DO NOTHING;
