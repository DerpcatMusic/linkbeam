ALTER TABLE links ADD COLUMN view_event_name TEXT NOT NULL DEFAULT 'ViewContent';
ALTER TABLE links ADD COLUMN click_event_name TEXT;

UPDATE links SET view_event_name = meta_event_name;

DROP TABLE IF EXISTS capi_failures;

CREATE TABLE capi_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  link_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  http_status INTEGER,
  meta_trace_id TEXT,
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_capi_log_retry ON capi_log(status, attempt, created_at);
CREATE INDEX idx_capi_log_created ON capi_log(created_at DESC);
