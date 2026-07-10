import { describe, expect, it, vi } from "vitest";
import { backfillDestinations } from "../src/lib/platforms/backfill";
import { mergeDestinations, mergeImported } from "../src/lib/platforms/shared";
import type { ImportedTrack } from "../src/lib/types";
import youtubeSearch from "./fixtures/youtube-music-search.json";

describe("mergeDestinations", () => {
  it("keeps the better link when one side is a search fallback", () => {
    const merged = mergeDestinations(
      { youtube: "https://music.youtube.com/search?q=killers" },
      { youtube: "https://music.youtube.com/watch?v=m2zUrruKjDQ" }
    );
    expect(merged.youtube).toBe("https://music.youtube.com/watch?v=m2zUrruKjDQ");
  });

  it("lets later parts win when link quality is equal", () => {
    const merged = mergeDestinations(
      { spotify: "https://open.spotify.com/track/secondary" },
      { spotify: "https://open.spotify.com/track/primary" }
    );
    expect(merged.spotify).toBe("https://open.spotify.com/track/primary");
  });

  it("ignores empty destination values", () => {
    const merged = mergeDestinations({ spotify: "" }, { spotify: "https://open.spotify.com/track/1" });
    expect(merged.spotify).toBe("https://open.spotify.com/track/1");
  });
});

describe("mergeImported", () => {
  it("prefers a direct YouTube link from Odesli over a search fallback on the primary import", () => {
    const primary: ImportedTrack = {
      provider: "spotify",
      sourceUrl: "https://open.spotify.com/track/1",
      title: "Mr. Brightside",
      artistName: "The Killers",
      destinations: {
        spotify: "https://open.spotify.com/track/1",
        youtube: "https://music.youtube.com/search?q=killers"
      }
    };
    const secondary: ImportedTrack = {
      provider: "odesli",
      sourceUrl: "https://open.spotify.com/track/1",
      destinations: {
        deezer: "https://www.deezer.com/track/1",
        youtube: "https://music.youtube.com/watch?v=m2zUrruKjDQ"
      }
    };

    const merged = mergeImported(primary, secondary);
    expect(merged.destinations.spotify).toContain("open.spotify.com/track/1");
    expect(merged.destinations.deezer).toContain("deezer.com/track/1");
    expect(merged.destinations.youtube).toBe("https://music.youtube.com/watch?v=m2zUrruKjDQ");
  });
});

describe("backfillDestinations", () => {
  it("upgrades a YouTube search fallback to a direct watch link", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(youtubeSearch), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const filled = await backfillDestinations({
      provider: "odesli",
      sourceUrl: "https://open.spotify.com/track/1",
      title: "Mr. Brightside",
      artistName: "The Killers",
      destinations: {
        spotify: "https://open.spotify.com/track/1",
        youtube: "https://music.youtube.com/search?q=The%20Killers%20Mr.%20Brightside"
      }
    });

    expect(filled.destinations.youtube).toBe("https://music.youtube.com/watch?v=m2zUrruKjDQ");
    vi.unstubAllGlobals();
  });

  it("falls back to a search URL when YouTube lookup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const filled = await backfillDestinations({
      provider: "odesli",
      sourceUrl: "https://open.spotify.com/track/1",
      title: "Mr. Brightside",
      artistName: "The Killers",
      destinations: { spotify: "https://open.spotify.com/track/1" }
    });

    expect(filled.destinations.youtube).toBe(
      "https://music.youtube.com/search?q=The%20Killers%20Mr.%20Brightside"
    );
    vi.unstubAllGlobals();
  });
});
