-- Sample client companies. Replace with real ones via the Billing page.
INSERT INTO companies (name, contact_person, email, phone, address, gstin, opening_balance, status) VALUES
('Gupta Furniture Works', 'Anil Gupta', 'accounts@guptafurniture.in', '+91 9811100011', 'Sector-108, Noida, U.P.', NULL, 0.00, 'Active'),
('Noida Steel Traders', 'Rakesh Kumar', 'billing@noidasteel.co.in', '+91 9811100022', 'B-7, Sector-69, Noida, U.P.', NULL, 0.00, 'Active'),
('Surajpur Logistics', 'Meena Devi', 'meena@surajpurlog.in', '+91 9811100033', 'Surajpur, Greater Noida, U.P.', NULL, 0.00, 'Active')
ON CONFLICT (name) DO NOTHING;
