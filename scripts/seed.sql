-- Local development seed. Apply with: pnpm db:seed
-- Never run against production.
-- Demo users are added once password hashing exists (Phase 1).

INSERT OR IGNORE INTO shops (id, slug, name, business_type, bio, theme_json, created_at)
VALUES (
  '0192f5a0-0000-7000-8000-000000000001',
  'demo-cafe',
  'Demo Café',
  'cafe',
  'A sample shop for local development.',
  '{"brand":"#8B5E3C","mode":"system","font":"inter","radius":"soft","coverOverlay":0.35,"presetId":"cafe-mocha"}',
  1767225600000
);

INSERT OR IGNORE INTO shops (id, slug, name, business_type, bio, theme_json, created_at)
VALUES (
  '0192f5a0-0000-7000-8000-000000000002',
  'demo-market',
  'Demo Market',
  'retail',
  'A second shop, used to check tenant isolation by hand.',
  '{"brand":"#2E9E5B","mode":"system","font":"inter","radius":"soft","coverOverlay":0.35,"presetId":"fresh-market"}',
  1767225600000
);
