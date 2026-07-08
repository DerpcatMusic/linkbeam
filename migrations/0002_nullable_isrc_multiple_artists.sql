PRAGMA foreign_keys = off;

CREATE TABLE tracks_new (
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

INSERT INTO tracks_new (
  id, isrc, title, artist_id, artwork_url, artwork_object_key, source_url,
  source_provider, release_at, live_at, created_at, updated_at
)
SELECT
  id, isrc, title, artist_id, artwork_url, artwork_object_key, source_url,
  source_provider, release_at, live_at, created_at, updated_at
FROM tracks;

DROP TABLE tracks;
ALTER TABLE tracks_new RENAME TO tracks;

CREATE TABLE IF NOT EXISTS track_artists (
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (track_id, artist_id)
);

INSERT OR IGNORE INTO track_artists (track_id, artist_id, sort_order)
SELECT id, artist_id, 0 FROM tracks WHERE artist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_track_artists_track_order ON track_artists(track_id, sort_order);

PRAGMA foreign_keys = on;
