-- Planned distance and rate basis are no longer part of trip or billing data.
-- Keep actual_distance: it records the final operational distance used for
-- vehicle odometer updates when a trip is completed.
ALTER TABLE trips DROP COLUMN IF EXISTS planned_distance;
ALTER TABLE trips DROP COLUMN IF EXISTS rate_basis;
ALTER TABLE bill_items DROP COLUMN IF EXISTS rate_basis;