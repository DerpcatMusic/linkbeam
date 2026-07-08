import { describe, expect, it } from "vitest";
import {
  parseSpotifyResource,
  spotifyAppUri,
  spotifyDestinationUrl,
  spotifyWebUrlWithContext
} from "../src/lib/spotify-links";
import type { Destination, SmartLink } from "../src/lib/types";

describe("Spotify link helpers", () => {
  it("parses Spotify web, canonical URI, and legacy app URI formats", () => {
    expect(parseSpotifyResource("https://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe?si=abc")).toEqual({
      type: "track",
      id: "4Beujzrm3xS4erq9gTBCLe"
    });
    expect(parseSpotifyResource("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toEqual({
      type: "playlist",
      id: "37i9dQZF1DXcBWIGoYBM5M"
    });
    expect(parseSpotifyResource("spotify://album/1ATL5GLyefJaxhQzSPVrLX")).toEqual({
      type: "album",
      id: "1ATL5GLyefJaxhQzSPVrLX"
    });
  });

  it("adds playlist context to track web URLs without dropping existing params", () => {
    expect(
      spotifyWebUrlWithContext(
        "https://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe?si=abc",
        "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
      )
    ).toBe("https://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe?si=abc&context=spotify%3Aplaylist%3A37i9dQZF1DXcBWIGoYBM5M");
  });

  it("normalizes plain Spotify destinations to https web URLs", () => {
    const link = {
      spotify_open_behavior: "web",
      spotify_context_url: null
    } as SmartLink;
    const destination = {
      platform: "spotify",
      url: "http://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe?si=abc"
    } as Destination;

    expect(spotifyDestinationUrl(link, destination)).toBe(
      "https://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe?si=abc"
    );
  });

  it("builds an app-first URI for a track inside a playlist context", () => {
    expect(
      spotifyAppUri(
        "https://open.spotify.com/track/4Beujzrm3xS4erq9gTBCLe",
        "spotify:playlist:37i9dQZF1DXcBWIGoYBM5M"
      )
    ).toBe("spotify://track/4Beujzrm3xS4erq9gTBCLe?context=spotify%3Aplaylist%3A37i9dQZF1DXcBWIGoYBM5M");
  });
});
