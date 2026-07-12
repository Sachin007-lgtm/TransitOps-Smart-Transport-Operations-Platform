INSERT INTO users (name, email, password_hash, role_id) VALUES
('Jane Doe', 'manager@transitops.com', '$2a$10$n4F0PjK9B2xM75k/u2w4iOlD1P1HqK3P6vU9L1j9vW7s8l/R3Z5tK', 1),
('Alex Smith', 'driver@transitops.com', '$2a$10$n4F0PjK9B2xM75k/u2w4iOlD1P1HqK3P6vU9L1j9vW7s8l/R3Z5tK', 2),
('Sarah Connor', 'safety@transitops.com', '$2a$10$n4F0PjK9B2xM75k/u2w4iOlD1P1HqK3P6vU9L1j9vW7s8l/R3Z5tK', 3),
('Frank Miller', 'analyst@transitops.com', '$2a$10$n4F0PjK9B2xM75k/u2w4iOlD1P1HqK3P6vU9L1j9vW7s8l/R3Z5tK', 4)
ON CONFLICT (email) DO NOTHING;
