import { afterEach, describe, expect, it, vi } from "vitest";
import { importSpotify, parseSpotifyEmbedHtml } from "../src/lib/platforms/spotify";
import type { RuntimeEnv } from "../src/lib/runtime";
import nextData from "./fixtures/spotify-embed-next-data.json";

describe("spotify embed parsing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses title, artists, artwork, release date, and palette from embed HTML", () => {
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
    const imported = parseSpotifyEmbedHtml(html);

    expect(imported.title).toBe("Mr. Brightside");
    expect(imported.artistName).toBe("The Killers");
    expect(imported.artistNames).toEqual(["The Killers"]);
    expect(imported.artworkUrl).toContain("ab67616d0000b273");
    expect(imported.releaseAt).toBe("2004-06-15");
    expect(imported.palette?.backgroundBase).toEqual({ alpha: 255, blue: 146, green: 83, red: 26 });
    expect(imported.palette?.textSubdued).toEqual({ alpha: 255, blue: 255, green: 210, red: 163 });
  });

  it("imports album artwork and artists from Spotify album embed pages", async () => {
    const albumNextData = structuredClone(nextData);
    const entity = albumNextData.props.pageProps.state.data.entity;
    entity.title = "Forever";
    entity.artists = [{ name: "Elin" }, { name: "Derpcat" }];
    entity.visualIdentity.image = [
      {
        url: "https://image-cdn-fa.spotifycdn.com/image/ab67616d00001e0294fc33d4340f4eaec8183bd9",
        maxHeight: 300,
        maxWidth: 300
      },
      {
        url: "https://image-cdn-fa.spotifycdn.com/image/ab67616d0000b27394fc33d4340f4eaec8183bd9",
        maxHeight: 640,
        maxWidth: 640
      }
    ];
    const html = `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(albumNextData)}</script></body></html>`;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html, { status: 200 }));

    const imported = await importSpotify({} as RuntimeEnv, "https://open.spotify.com/album/4Beujzrm3xS4erq9gTBCLe?si=abc");

    expect(fetchMock).toHaveBeenCalledWith("https://open.spotify.com/embed/album/4Beujzrm3xS4erq9gTBCLe");
    expect(imported.title).toBe("Forever");
    expect(imported.artistNames).toEqual(["Elin", "Derpcat"]);
    expect(imported.artworkUrl).toContain("ab67616d0000b27394fc33d4340f4eaec8183bd9");
    expect(imported.destinations.spotify).toBe("https://open.spotify.com/album/4Beujzrm3xS4erq9gTBCLe?si=abc");
  });
});
