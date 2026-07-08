import { describe, expect, it } from "vitest";
import { parseYouTubeMusicSearch } from "../src/lib/platforms/youtube";
import youtubeSearch from "./fixtures/youtube-music-search.json";

describe("YouTube Music search parsing", () => {
  it("extracts title, artist, and video id from InnerTube search results", () => {
    const results = parseYouTubeMusicSearch(youtubeSearch);
    expect(results[0]).toEqual({
      title: "Mr. Brightside",
      artist: "The Killers",
      videoId: "m2zUrruKjDQ"
    });
  });
});
