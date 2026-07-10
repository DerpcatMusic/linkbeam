import { describe, expect, it } from "vitest";
import { consumeSubscribeLimit, retentionDaysFromEnv } from "../src/lib/subscriber-privacy";

function privacyEnv() {
  const values = new Map<string, string>();
  const keys: string[] = [];
  return {
    keys,
    RATE_LIMIT_SECRET: "rate-limit-secret",
    LINK_CACHE: {
      async get(key: string) { keys.push(key); return values.get(key) ?? null; },
      async put(key: string, value: string) { keys.push(key); values.set(key, value); }
    }
  } as any;
}

describe("subscriber privacy", () => {
  it("allows five attempts and blocks the sixth without storing the raw IP", async () => {
    const env = privacyEnv();
    const request = new Request("https://links.test/api/subscribe", {
      headers: { "cf-connecting-ip": "203.0.113.8" }
    });
    for (let count = 0; count < 5; count += 1) {
      await expect(consumeSubscribeLimit(env, request, "link_1")).resolves.toBe(true);
    }
    await expect(consumeSubscribeLimit(env, request, "link_1")).resolves.toBe(false);
    expect(env.keys.every((key: string) => !key.includes("203.0.113.8"))).toBe(true);
  });

  it("requires a rate-limit secret", async () => {
    const env = privacyEnv();
    delete env.RATE_LIMIT_SECRET;
    await expect(consumeSubscribeLimit(env, new Request("https://links.test"), "link_1")).rejects.toThrow(/RATE_LIMIT_SECRET/);
  });

  it("normalizes subscriber retention days", () => {
    expect(retentionDaysFromEnv({ SUBSCRIBER_RETENTION_DAYS: "30" })).toBe(30);
    expect(retentionDaysFromEnv({ SUBSCRIBER_RETENTION_DAYS: "0" })).toBe(365);
    expect(retentionDaysFromEnv({ SUBSCRIBER_RETENTION_DAYS: "nope" })).toBe(365);
  });
});
