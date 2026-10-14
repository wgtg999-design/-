CREATE TABLE auth_identity_links (
  provider_user_id TEXT PRIMARY KEY NOT NULL,
  legacy_user_id TEXT UNIQUE NOT NULL,
  verified_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE store_upload_tickets (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  object_key TEXT UNIQUE NOT NULL,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
  byte_length INTEGER NOT NULL CHECK(byte_length > 0 AND byte_length <= 8388608),
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','complete','rejected')),
  final_key TEXT
);
--> statement-breakpoint
CREATE INDEX store_upload_tickets_expiry ON store_upload_tickets(expires_at);
