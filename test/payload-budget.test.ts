import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { compactAsciiPatternDataUri, PAGE_BACKGROUND_STYLES, STYLE_CARD_PREVIEW_PALETTE } from "../src/lib/page-style";

describe("server-rendered payload budgets", () => {
  it("keeps every style fallback safely inside the 40 KB preview budget", () => {
    for (const style of PAGE_BACKGROUND_STYLES) {
      const fallback = style === "ascii" ? compactAsciiPatternDataUri(STYLE_CARD_PREVIEW_PALETTE) : style;
      expect(new TextEncoder().encode(fallback).byteLength).toBeLessThan(4_000);
    }
  });

  it("does not serialize a procedural ASCII grid into fan or editor HTML", () => {
    const pageStyle = readFileSync(resolve(import.meta.dirname, "../src/lib/page-style.ts"), "utf8");
    expect(pageStyle).not.toContain("proceduralAsciiGrid(");
    expect(pageStyle).not.toContain("asciiGridToSvgDataUri(");
  });
});
