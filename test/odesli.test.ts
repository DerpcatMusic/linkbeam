import { describe, expect, it } from "vitest";
import { mapOdesliDestinations, parseOdesliResponse } from "../src/lib/platforms/odesli";
import odesliResponse from "./fixtures/odesli-response.json";

describe("odesli parsing", () => {
  it("maps platform destination URLs", () => {
    const destinations = mapOdesliDestinations(odesliResponse.linksByPlatform);
    expect(destinations.spotify).toContain("open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp");
    expect(destinations.deezer).toContain("deezer.com/track/");
    expect(destinations.tidal).toContain("tidal.com/track/");
    expect(destinations.amazon).toContain("amazon");
    expect(destinations).not.toHaveProperty("napster");
    expect(destinations).not.toHaveProperty("pandora");
  });

  it("parses metadata and destinations into ImportedTrack", () => {
    const imported = parseOdesliResponse(odesliResponse, "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp");
    expect(imported.provider).toBe("odesli");
    expect(imported.title).toBe("Mr. Brightside");
    expect(imported.artistName).toBe("The Killers");
    expect(imported.artworkUrl).toContain("scdn.co/image/");
    expect(imported.destinations.spotify).toContain("open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp");
    expect(imported.destinations.deezer).toBeTruthy();
  });
});
