-- 001_initial_transitops_schema.sql
-- TransitOps Clean UUID Baseline Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended', 'Inactive')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Roles (strictly 3 roles)
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL CHECK (name IN ('Platform Admin', 'Owner/Manager', 'Driver')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Drivers
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    name VARCHAR(100) NOT NULL,
    license_number VARCHAR(50) UNIQUE NOT NULL,
    license_category VARCHAR(50) NOT NULL DEFAULT 'LMV',
    license_expiry_date DATE NOT NULL,
    contact_number VARCHAR(30) NOT NULL,
    safety_score DECIMAL(5, 2) DEFAULT 100.00 CHECK (safety_score >= 0.00 AND safety_score <= 100.00),
    status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'On Trip', 'Off Duty', 'Suspended')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_drivers_id_org UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_drivers_org ON drivers(organization_id);

-- 4. Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone_number VARCHAR(30),
    password_hash VARCHAR(255) NOT NULL,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT,
    driver_id UUID REFERENCES drivers(id) ON DELETE RESTRICT,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_driver_org FOREIGN KEY (driver_id, organization_id)
        REFERENCES drivers(id, organization_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(TRIM(email))) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number_unique ON users (phone_number) WHERE phone_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_driver_id_unique ON users (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- 5. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    registration_number VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    sub_category VARCHAR(50),
    region VARCHAR(100),
    max_load_capacity DECIMAL(10, 2) NOT NULL,
    odometer DECIMAL(12, 2) DEFAULT 0.00,
    acquisition_cost DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Available' CHECK (status IN ('Available', 'On Trip', 'In Shop', 'Retired')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_vehicle_reg_org UNIQUE (registration_number, organization_id),
    CONSTRAINT uq_vehicles_id_org UNIQUE (id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_vehicles_org ON vehicles(organization_id);

-- 6. Trips
CREATE TABLE IF NOT EXISTS trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    origin VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    planned_route TEXT NOT NULL,
    vehicle_id UUID,
    driver_id UUID,
    cargo_weight DECIMAL(10, 2) DEFAULT 0.00,
    planned_distance DECIMAL(10, 2) DEFAULT 0.00,
    actual_distance DECIMAL(10, 2),
    revenue DECIMAL(10, 2) DEFAULT 0.00,
    start_time TIMESTAMPTZ NOT NULL,
    expected_arrival TIMESTAMPTZ NOT NULL,
    actual_arrival TIMESTAMPTZ,
    external_party_name VARCHAR(150),
    external_party_type VARCHAR(20) CHECK (external_party_type IN ('CUSTOMER', 'AGENCY')),
    status VARCHAR(20) DEFAULT 'Draft' CHECK (status IN ('Draft', 'Planned', 'Assigned', 'Dispatched', 'Completed', 'Cancelled')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_trips_id_org UNIQUE (id, organization_id),
    CONSTRAINT fk_trips_vehicle_org FOREIGN KEY (vehicle_id, organization_id)
        REFERENCES vehicles(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_trips_driver_org FOREIGN KEY (driver_id, organization_id)
        REFERENCES drivers(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_trips_org_status ON trips(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_driver ON trips(driver_id);

-- 7. Vehicle Locations (Append-Only Telemetry)
CREATE TABLE IF NOT EXISTS vehicle_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    trip_id UUID NOT NULL,
    vehicle_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    altitude DOUBLE PRECISION,
    captured_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_locations_trip_org FOREIGN KEY (trip_id, organization_id)
        REFERENCES trips(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_locations_vehicle_org FOREIGN KEY (vehicle_id, organization_id)
        REFERENCES vehicles(id, organization_id) ON DELETE RESTRICT,
    CONSTRAINT fk_locations_driver_org FOREIGN KEY (driver_id, organization_id)
        REFERENCES drivers(id, organization_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_locations_trip_captured ON vehicle_locations(trip_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_locations_org ON vehicle_locations(organization_id);

-- 8. Trigger 1: Enforce Role Invariants on Users
CREATE OR REPLACE FUNCTION enforce_user_role_invariants()
RETURNS TRIGGER AS $$
DECLARE
    v_role_name VARCHAR(50);
BEGIN
    SELECT name INTO v_role_name FROM roles WHERE id = NEW.role_id;
    
    IF v_role_name = 'Platform Admin' THEN
        IF NEW.organization_id IS NOT NULL OR NEW.driver_id IS NOT NULL THEN
            RAISE EXCEPTION 'Platform Admin cannot belong to an organization or have a driver profile.';
        END IF;
        IF NEW.email IS NULL THEN
            RAISE EXCEPTION 'Platform Admin must have an email address.';
        END IF;
    ELSIF v_role_name = 'Owner/Manager' THEN
        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'Owner/Manager must belong to an organization.';
        END IF;
        IF NEW.driver_id IS NOT NULL THEN
            RAISE EXCEPTION 'Owner/Manager cannot have a driver profile.';
        END IF;
        IF NEW.email IS NULL THEN
            RAISE EXCEPTION 'Owner/Manager must have an email address.';
        END IF;
    ELSIF v_role_name = 'Driver' THEN
        IF NEW.organization_id IS NULL THEN
            RAISE EXCEPTION 'Driver must belong to an organization.';
        END IF;
        IF NEW.driver_id IS NULL THEN
            RAISE EXCEPTION 'Driver account must be linked to a driver profile.';
        END IF;
        IF NEW.phone_number IS NULL THEN
            RAISE EXCEPTION 'Driver must have a contact phone number for mobile login.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid role: %', v_role_name;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_role_invariants ON users;
CREATE TRIGGER trg_user_role_invariants
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION enforce_user_role_invariants();

-- 9. Trigger 2: Enforce Location Trip-Assignment Consistency
CREATE OR REPLACE FUNCTION verify_location_trip_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_trip RECORD;
BEGIN
    SELECT organization_id, vehicle_id, driver_id, status
    INTO v_trip
    FROM trips
    WHERE id = NEW.trip_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Referenced trip % does not exist.', NEW.trip_id;
    END IF;

    IF v_trip.organization_id <> NEW.organization_id THEN
        RAISE EXCEPTION 'Location organization % does not match trip organization %.', NEW.organization_id, v_trip.organization_id;
    END IF;

    IF NEW.vehicle_id IS DISTINCT FROM v_trip.vehicle_id THEN
        RAISE EXCEPTION 'Location vehicle does not match assigned trip vehicle.';
    END IF;

    IF NEW.driver_id IS DISTINCT FROM v_trip.driver_id THEN
        RAISE EXCEPTION 'Location driver does not match assigned trip driver.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_verify_location_consistency ON vehicle_locations;
CREATE TRIGGER trg_verify_location_consistency
BEFORE INSERT ON vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION verify_location_trip_consistency();

-- 10. Trigger 3: Enforce Append-Only Immutability on Telemetry (Block UPDATE)
CREATE OR REPLACE FUNCTION prevent_telemetry_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Telemetry records in vehicle_locations are strictly append-only and cannot be updated.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_telemetry_update ON vehicle_locations;
CREATE TRIGGER trg_prevent_telemetry_update
BEFORE UPDATE ON vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION prevent_telemetry_modification();

-- 11. Trigger 4: Enforce Append-Only Immutability on Telemetry (Block DELETE)
CREATE OR REPLACE FUNCTION prevent_telemetry_deletion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Telemetry records in vehicle_locations are immutable historical records and cannot be deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_telemetry_delete ON vehicle_locations;
CREATE TRIGGER trg_prevent_telemetry_delete
BEFORE DELETE ON vehicle_locations
FOR EACH ROW
EXECUTE FUNCTION prevent_telemetry_deletion();

-- 12. Trigger 5: Prevent Trip Reassignment with Telemetry or when Finalized
CREATE OR REPLACE FUNCTION prevent_trip_reassignment_with_telemetry()
RETURNS TRIGGER AS $$
DECLARE
    v_telemetry_count INT;
BEGIN
    -- Check if vehicle_id or driver_id changed
    IF (OLD.vehicle_id IS DISTINCT FROM NEW.vehicle_id) OR (OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
        -- 1. Disallow reassignment if trip WAS finalized OR is BEING finalized in this statement
        IF OLD.status IN ('Completed', 'Cancelled') OR NEW.status IN ('Completed', 'Cancelled') THEN
            RAISE EXCEPTION 'Cannot reassign vehicle or driver for finalized trip % (previous status: %, target status: %).', 
                OLD.id, OLD.status, NEW.status;
        END IF;

        -- 2. Disallow reassignment if telemetry has already been recorded
        SELECT COUNT(*) INTO v_telemetry_count
        FROM vehicle_locations
        WHERE trip_id = OLD.id;

        IF v_telemetry_count > 0 THEN
            RAISE EXCEPTION 'Cannot reassign vehicle or driver for trip % because % telemetry record(s) already exist.', 
                OLD.id, v_telemetry_count;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_trip_reassignment ON trips;
CREATE TRIGGER trg_prevent_trip_reassignment
BEFORE UPDATE OF vehicle_id, driver_id, status ON trips
FOR EACH ROW
EXECUTE FUNCTION prevent_trip_reassignment_with_telemetry();
