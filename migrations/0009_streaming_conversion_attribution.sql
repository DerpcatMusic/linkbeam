ALTER TABLE metric_events ADD COLUMN utm_medium TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN utm_content TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN utm_term TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN fbclid_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN ad_id TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN adset_id TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN campaign_id TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN placement TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN referrer TEXT NOT NULL DEFAULT '';
ALTER TABLE metric_events ADD COLUMN landing_path TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_metric_events_link_utm_medium ON metric_events(link_id, utm_medium);
CREATE INDEX idx_metric_events_link_ad_id ON metric_events(link_id, ad_id);
CREATE INDEX idx_metric_events_link_fbclid ON metric_events(link_id, fbclid_hash);
