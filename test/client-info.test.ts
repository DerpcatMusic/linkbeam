import { describe, expect, it } from "vitest";
import { clientInfoFromRequest } from "../src/lib/client-info";

describe("clientInfoFromRequest", () => {
  it("normalizes mobile in-app browser traffic for dashboard analytics", () => {
    const request = new Request("https://links.test/out/song/spotify?sr=390x844&vp=390x720&lang=en-US", {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 335.0.0.31.90",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": "\"iOS\""
      }
    });

    expect(clientInfoFromRequest(request)).toMatchObject({
      deviceType: "mobile",
      browserName: "Instagram",
      osName: "iOS",
      osVersion: "17.5",
      screenResolution: "390x844",
      viewportSize: "390x720",
      language: "en-US"
    });
  });

  it("uses Cloudflare and client hint fields when they exist", () => {
    const request = new Request("https://links.test/song", {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "sec-ch-ua-platform": "\"Windows\"",
        "sec-ch-ua-mobile": "?0",
        "cf-ipcountry": "US"
      }
    });
    Object.defineProperty(request, "cf", {
      value: {
        country: "US",
        colo: "LAX",
        region: "California",
        city: "Los Angeles",
        asn: 32934,
        asOrganization: "Meta Platforms, Inc.",
        timezone: "America/Los_Angeles",
        httpProtocol: "HTTP/3"
      }
    });

    expect(clientInfoFromRequest(request)).toMatchObject({
      deviceType: "desktop",
      browserName: "Chrome",
      browserVersion: "126.0.0.0",
      osName: "Windows",
      country: "US",
      colo: "LAX",
      region: "California",
      city: "Los Angeles",
      asn: "32934",
      asOrganization: "Meta Platforms, Inc.",
      timezone: "America/Los_Angeles",
      httpProtocol: "HTTP/3"
    });
  });
});
