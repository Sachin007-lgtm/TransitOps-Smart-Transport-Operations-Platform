INSERT INTO organizations (
    id,
    name,
    slug,
    status
) VALUES (
    'org-1',
    'Default Development Organization',
    'default-org-1',
    'Active'
)
ON CONFLICT (id) DO NOTHING;
