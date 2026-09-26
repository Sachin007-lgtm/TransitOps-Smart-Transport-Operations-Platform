-- Planned distance and rate basis are no longer collected or edited as part of
-- a trip: the trip create/update path, the client form and the printed bill all
-- stopped using them.
--
-- Only rate_basis is dropped here. planned_distance must STAY: dev's location
-- tracking reads t.planned_distance (locationModel), the mobile trip screen uses
-- it to prefill actual distance and displays it, the development seed inserts it,
-- and several test fixtures do too. Dropping the column belongs in a coordinated
-- follow-up with whoever owns location tracking, not in a billing migration.
--
-- Keep actual_distance: it records the final operational distance used for
-- vehicle odometer updates when a trip is completed.
ALTER TABLE trips DROP COLUMN IF EXISTS rate_basis;
ALTER TABLE bill_items DROP COLUMN IF EXISTS rate_basis;
