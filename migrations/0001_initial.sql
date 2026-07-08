CREATE TABLE artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE tracks (
  id TEXT PRIMARY KEY,
  isrc TEXT UNIQUE,
  title TEXT NOT NULL,
  artist_id TEXT REFERENCES artists(id),
  artwork_url TEXT,
  artwork_object_key TEXT,
  source_url TEXT,
  source_provider TEXT NOT NULL DEFAULT 'manual',
  release_at TEXT,
  live_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE track_artists (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, artist_id)
);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL REFERENCES tracks(id),
  link_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('presave', 'live')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  meta_event_name TEXT NOT NULL DEFAULT 'ViewContent',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at TEXT
);

CREATE TABLE destinations (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(link_id, platform)
);

CREATE TABLE daily_metrics (
  day TEXT NOT NULL,
  link_id TEXT NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT '',
  views INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  presaves INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, link_id, platform)
);

CREATE TABLE capi_failures (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  link_id TEXT,
  payload TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_links_status_slug ON links(status, slug);
CREATE INDEX idx_track_artists_track_order ON track_artists(track_id, sort_order);
CREATE INDEX idx_destinations_link_order ON destinations(link_id, sort_order);
CREATE INDEX idx_daily_metrics_link_day ON daily_metrics(link_id, day);
