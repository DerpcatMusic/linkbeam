import { describe, expect, it } from "vitest";
import { DEFAULT_WORKER_NAME, DOCS_BASE_URL, PRODUCT_NAME, PRODUCT_SLUG, REPOSITORY_URL, USER_AGENT } from "../src/lib/brand";

describe("canonical brand", () => {
  it("defines the Linkbeam identity", () => {
    expect(PRODUCT_NAME).toBe("Linkbeam");
    expect(PRODUCT_SLUG).toBe("linkbeam");
    expect(REPOSITORY_URL).toBe("https://github.com/DerpcatMusic/linkbeam");
    expect(DOCS_BASE_URL).toBe("https://derpcatmusic.github.io/linkbeam");
    expect(DEFAULT_WORKER_NAME).toBe("linkbeam");
    expect(USER_AGENT).toContain("Linkbeam/1.0");
  });
});
