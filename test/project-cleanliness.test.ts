import { describe, expect, it } from "vitest";
import wrangler from "../wrangler.jsonc?raw";
import cleanup from "../migrations/0008_cleanup_legacy.sql?raw";
import pkg from "../package.json";
import marketingLayout from "../src/layouts/MarketingLayout.astro?raw";
import marketingCss from "../src/styles/marketing.css?raw";
import marketingPage from "../src/pages/index.astro?raw";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const globalCss = readFileSync(resolve(import.meta.dirname, "../src/styles/global.css"), "utf8");
const repoRoot = resolve(import.meta.dirname, "..");

function staleBrandMatches(): string[] {
  const matches: string[] = [];
  const allowed = /(?:--beamlink-|\.beamlink-|Legacy Beamlink|sync-from-beamlink\.sh|BEAMLINK_DIR)/i;
  const visit = (relative: string) => {
    for (const entry of readdirSync(resolve(repoRoot, relative), { withFileTypes: true })) {
      const next = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (["node_modules", ".git", ".astro", "dist", ".worktrees"].includes(entry.name) || next === "docs/superpowers") continue;
        visit(next);
      } else if (/\.(?:astro|css|html|md|mjs|jsonc|svg|ts|txt)$/.test(entry.name) && next !== "test/project-cleanliness.test.ts") {
        readFileSync(resolve(repoRoot, next), "utf8").split("\n").forEach((line, index) => {
          if (/beamlink/i.test(line) && !allowed.test(line)) matches.push(`${next}:${index + 1}`);
        });
      }
    }
  };
  for (const root of ["src", "docs", "test"]) visit(root);
  for (const file of ["README.md", "AGENTS.md", "PRODUCT.md", "DESIGN.md", "wrangler.jsonc", "astro.config.mjs"]) {
    readFileSync(resolve(repoRoot, file), "utf8").split("\n").forEach((line, index) => {
      if (/beamlink/i.test(line) && !allowed.test(line)) matches.push(`${file}:${index + 1}`);
    });
  }
  return matches;
}

describe("project cleanup", () => {
  it("does not keep a user-managed Astro SESSION namespace in source config", () => {
    expect(wrangler).not.toContain('"binding": "SESSION"');
  });

  it("has a final migration that removes legacy audit and meta event schema", () => {
    expect(cleanup).toContain("DROP TABLE IF EXISTS audit_log");
    expect(cleanup).toContain("DROP COLUMN meta_event_name");
  });

  it("pins Bun and exposes deterministic dev and smoke commands", () => {
    expect(pkg.packageManager).toBe("bun@1.3.14");
    expect(pkg.scripts.dev).toBe("wrangler d1 migrations apply DB --local && bun scripts/dev.mjs");
    expect(pkg.scripts.smoke).toBe("bash scripts/smoke-worker.sh");
  });

  it("keeps marketing free of banned decoration and remote fonts", () => {
    expect(marketingLayout).not.toContain("fonts.googleapis.com");
    expect(marketingCss).not.toMatch(/m-aurora|background-size:\s*(40|48)px\s+(40|48)px/);
    expect(marketingPage).not.toContain("Loads in ~150ms");
  });

  it("keeps mobile controls and marketing comparison accessible", () => {
    expect(globalCss).toMatch(/@media[^}]+max-width:[^}]+\.button[^}]+min-height:\s*2\.75rem/s);
    expect(marketingPage).toContain("<table>");
    expect(marketingPage).toContain('aria-label="Open navigation"');
  });

  it("defines Linkbeam tokens and legacy aliases", () => {
    expect(globalCss).toContain("--linkbeam-bg:");
    expect(globalCss).toContain("--beamlink-bg: var(--linkbeam-bg)");
    expect(globalCss).not.toMatch(/var\(--beamlink-/);
  });

  it("keeps the retired product name inside compatibility and historical files", () => {
    expect(staleBrandMatches()).toEqual([]);
  });

  it("uses Linkbeam defaults for new installs", () => {
    expect(wrangler).toContain('"name": "linkbeam"');
    expect(wrangler).toContain('"bucket_name": "linkbeam-artwork"');
    expect(wrangler).toContain('"queue": "linkbeam-conversions"');
  });
});
