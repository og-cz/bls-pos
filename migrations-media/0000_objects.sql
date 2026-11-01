-- Media database (binding MEDIA_DB): shop photos and nightly backups.
-- Used instead of R2 so the free plan needs no card (docs/LIMITS.md). Keys look like
-- shops/<shopId>/<kind>/<id>.<ext> and backups/<shopId>/<day>.json.gz.
-- A D1 row holds at most 2,000,000 bytes, so uploads are capped below that.
CREATE TABLE objects (
  key TEXT PRIMARY KEY NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
