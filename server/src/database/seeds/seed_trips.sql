-- Demo billable trips: completed trips tied to seed companies, shaped like
-- the real paper bills (per-trip advance + rate basis). Idempotent: the whole
-- block is skipped if any trip already has a company assigned.
INSERT INTO trips (
  source, destination, vehicle_id, driver_id, cargo_weight, planned_distance,
  revenue, advance_received, status, trip_date, company_id, rate_basis
)
SELECT v.source, v.destination, v.vehicle_id, v.driver_id, v.cargo_weight, v.planned_distance,
       v.revenue, v.advance_received, 'Completed', v.trip_date::date,
       (SELECT id FROM companies WHERE name = v.company_name), v.rate_basis
FROM (VALUES
  ('Sector-108', 'Kanpur',        3, 1, 1200.00, 480.00, 25000.00, 0.00,     '2026-08-07', 'Gupta Furniture Works', 'Per trip'),
  ('Sector-108', 'Sector-108',    1, 1,  450.00,  12.00,  3000.00, 500.00,  '2026-08-23', 'Gupta Furniture Works', 'Local point'),
  ('Sector-108', 'Muradabad',     3, 2, 1800.00, 160.00,  9000.00, 0.00,     '2026-08-04', 'Gupta Furniture Works', 'Per trip'),
  ('Surajpur',   'Muradabad',     4, 2, 2100.00, 170.00,  9000.00, 5000.00,  '2026-08-10', 'Noida Steel Traders',   'Per trip'),
  ('Surajpur',   'Banaras',       4, 3, 2800.00, 760.00, 32000.00, 2000.00,  '2026-08-11', 'Noida Steel Traders',   'Per trip'),
  ('Surajpur',   'Surajpur',      1, 3,  300.00,   8.00,  3500.00, 0.00,     '2026-08-25', 'Surajpur Logistics',    'Two point'),
  ('Surajpur',   'Kanpur',        3, 1, 1500.00, 470.00, 22000.00, 16000.00, '2026-08-18', 'Surajpur Logistics',    'Per trip')
) AS v(source, destination, vehicle_id, driver_id, cargo_weight, planned_distance,
       revenue, advance_received, trip_date, company_name, rate_basis)
WHERE NOT EXISTS (SELECT 1 FROM trips WHERE company_id IS NOT NULL);
