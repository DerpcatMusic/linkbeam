ALTER TABLE links ADD COLUMN paid_click_event_name TEXT NOT NULL DEFAULT 'Stream_Click_Paid';
ALTER TABLE links ADD COLUMN spotify_open_behavior TEXT NOT NULL DEFAULT 'web';
ALTER TABLE links ADD COLUMN spotify_context_url TEXT;

ALTER TABLE metric_events ADD COLUMN device_type TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN browser_name TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN browser_version TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN os_name TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN os_version TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN screen_resolution TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN viewport_size TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN language TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN cf_colo TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN region TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN city TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN asn TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN as_organization TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN timezone TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN http_protocol TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_metric_events_link_device_type ON metric_events(link_id, device_type);
CREATE INDEX idx_metric_events_link_browser ON metric_events(link_id, browser_name);
CREATE INDEX idx_metric_events_link_os ON metric_events(link_id, os_name);
