import { afterEach, describe, expect, it, vi } from "vitest";
import { safeFetchStream, safeFetchText, validateRemoteUrl } from "../src/lib/safe-fetch";
import { importOpenGraph } from "../src/lib/platforms/open-graph";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safe remote fetch", () => {
  it.each([
    "http://127.0.0.1/release",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/release",
    "http://music.local/release",
    "file:///tmp/release",
    "https://user:secret@music.example/release"
  ])("rejects non-public URL %s", (url) => {
    expect(() => validateRemoteUrl(url)).toThrow(/public HTTP or HTTPS/i);
  });

  it("reads bounded HTML responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Release</title>", {
      headers: { "content-type": "text/html" }
    })));

    const result = await safeFetchText("https://music.example/release", {
      maxBytes: 64,
      timeoutMs: 100
    });

    expect(result.text).toBe("<title>Release</title>");
  });

  it("rejects oversized HTML from content-length", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(33), {
      headers: { "content-type": "text/html", "content-length": "33" }
    })));

    await expect(safeFetchText("https://music.example/release", {
      maxBytes: 32,
      timeoutMs: 100
    })).rejects.toThrow(/too large/i);
  });

  it("rejects redirects to private targets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/private" }
    })));

    await expect(safeFetchText("https://music.example/release", {
      maxBytes: 64,
      timeoutMs: 100
    })).rejects.toThrow(/public HTTP or HTTPS/i);
  });

  it("rejects non-image artwork", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not an image", {
      headers: { "content-type": "text/plain" }
    })));

    await expect(safeFetchStream("https://cdn.example/cover", {
      maxBytes: 64,
      timeoutMs: 100,
      accept: /^image\//i
    })).rejects.toThrow(/content type/i);
  });

  it("blocks private Open Graph imports before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(importOpenGraph("http://127.0.0.1/private")).rejects.toThrow(/public HTTP or HTTPS/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
