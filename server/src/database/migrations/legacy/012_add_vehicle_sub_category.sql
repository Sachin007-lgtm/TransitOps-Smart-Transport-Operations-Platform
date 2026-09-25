-- 012_add_vehicle_sub_category.sql

-- Add nullable sub_category to vehicles table for size/sub-classification
ALTER TABLE vehicles
ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50);
