-- Default demo users — password for all accounts is: password123
-- Hash generated with bcryptjs rounds=10
INSERT INTO users (name, email, password_hash, role_id) VALUES
  ('Fleet Admin',      'fleet@transitops.com',    '$2a$10$BVnctpIK.1An4eIgBqAVSeV4KTsVFz/.6iVg3D/YHK7FjewsQ9AWG', 1),
  ('Driver Demo',      'driver@transitops.com',   '$2a$10$BVnctpIK.1An4eIgBqAVSeV4KTsVFz/.6iVg3D/YHK7FjewsQ9AWG', 2),
  ('Safety Officer',   'safety@transitops.com',   '$2a$10$BVnctpIK.1An4eIgBqAVSeV4KTsVFz/.6iVg3D/YHK7FjewsQ9AWG', 3),
  ('Finance Analyst',  'finance@transitops.com',  '$2a$10$BVnctpIK.1An4eIgBqAVSeV4KTsVFz/.6iVg3D/YHK7FjewsQ9AWG', 4)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;
