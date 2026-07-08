CREATE TABLE capi_log_new (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  link_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'retried')),
  http_status INTEGER,
  meta_trace_id TEXT,
  error_message TEXT,
  attempt INTEGER NOT NULL DEFAULT 1,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO capi_log_new SELECT * FROM capi_log;

DROP TABLE capi_log;

ALTER TABLE capi_log_new RENAME TO capi_log;

CREATE INDEX idx_capi_log_retry ON capi_log(status, attempt, created_at);
CREATE INDEX idx_capi_log_created ON capi_log(created_at DESC);
