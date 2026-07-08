export type LinkMode = "presave" | "live";
export type LinkStatus = "draft" | "published" | "archived";
export type SpotifyOpenBehavior = "web" | "playlist_context" | "app_first";

export type Platform =
  | "spotify"
  | "apple"
  | "youtube"
  | "soundcloud"
  | "bandcamp"
  | "deezer"
  | "tidal"
  | "amazon"
  | "other";

export interface TrackPalette {
  backgroundBase?: RgbaColor;
  backgroundTintedBase?: RgbaColor;
  textBase?: RgbaColor;
  textBrightAccent?: RgbaColor;
  textSubdued?: RgbaColor;
}

export interface RgbaColor {
  alpha: number;
  red: number;
  green: number;
  blue: number;
}

export interface Track {
  id: string;
  isrc: string | null;
  title: string;
  artist_id: string | null;
  artist_name: string;
  artist_names: string[];
  artwork_url: string | null;
  artwork_object_key: string | null;
  source_url: string | null;
  source_provider: string;
  release_at: string | null;
  live_at: string | null;
  palette: string | null;
}

export interface Destination {
  id: string;
  link_id: string;
  platform: Platform;
  label: string;
  url: string;
  sort_order: number;
  is_primary: number;
}

export interface SmartLink {
  id: string;
  track_id: string;
  link_name: string;
  slug: string;
  mode: LinkMode;
  status: LinkStatus;
  view_event_name: string;
  click_event_name: string | null;
  paid_click_event_name: string;
  spotify_open_behavior: SpotifyOpenBehavior;
  spotify_context_url: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  track: Track;
  destinations: Destination[];
}

export interface ImportedTrack {
  provider: string;
  sourceUrl: string;
  isrc?: string;
  title?: string;
  artistName?: string;
  artistNames?: string[];
  artworkUrl?: string;
  releaseAt?: string;
  liveAt?: string;
  palette?: TrackPalette;
  destinations: Partial<Record<Platform, string>>;
}

export const platformLabels: Record<Platform, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube Music",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  deezer: "Deezer",
  tidal: "TIDAL",
  amazon: "Amazon Music",
  other: "Listen"
};
