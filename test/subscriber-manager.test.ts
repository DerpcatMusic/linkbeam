import { describe, expect, it } from "vitest";
import source from "../src/components/SubscriberManager.astro?raw";

describe("subscriber manager", () => {
  it("provides export and scoped deletion with live status", () => {
    expect(source).toContain("Export email signups");
    expect(source).toContain("data-delete-subscriber");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("/subscribers/${subscriberId}");
  });
});
