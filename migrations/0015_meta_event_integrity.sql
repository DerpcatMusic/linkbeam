ALTER TABLE links ADD COLUMN learning_click_event_name TEXT
  CHECK (learning_click_event_name IN ('ViewContent', 'Lead', 'Stream_Click') OR learning_click_event_name IS NULL);

CREATE TABLE meta_event_claims (
  claim_key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_meta_event_claims_created ON meta_event_claims(created_at);

ALTER TABLE capi_log ADD COLUMN events_received INTEGER;
ALTER TABLE capi_log ADD COLUMN response_messages TEXT;
