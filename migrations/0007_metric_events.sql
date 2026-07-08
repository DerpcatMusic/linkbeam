CREATE TABLE metric_events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('view', 'click', 'presave', 'subscribe')),
  platform TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  visitor_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_metric_events_link_day ON metric_events(link_id, day);
CREATE INDEX idx_metric_events_link_country ON metric_events(link_id, country);
CREATE INDEX idx_metric_events_link_utm_campaign ON metric_events(link_id, utm_campaign);
