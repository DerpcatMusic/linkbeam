import type { Platform } from "@lib/types";

// Official brand colors (Simple Icons), tuned for legibility on the dark admin surface.
// Tidal ships black and Amazon Music has no canonical single color, so both use
// values that stay visible against the dark background.
export const platformBrandColors: Record<Platform, string> = {
  spotify: "#1ED760",
  apple: "#FA5A6E",
  youtube: "#FF3B30",
  soundcloud: "#FF7733",
  bandcamp: "#5AA6BA",
  deezer: "#B25CFF",
  tidal: "#E6E7EC",
  amazon: "#2FD4DE",
  other: "#9AA0AE"
};
