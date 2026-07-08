# Page Style Enhancements Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Upgrade all smartlink background/button styles, add per-style knobs, and ship real artwork-derived ASCII with static + live motion.

**Architecture:** Progressive enhancement — CSS-first SSR with `page_style_options` JSON; client canvas samples cover art for ASCII; admin cards use track palette + knobs in live preview.

**Tech Stack:** Astro SSR on Cloudflare Workers, D1, Zod, Vitest, CSS custom properties, small inline canvas script.

---

### Task 1: Options schema + migration
### Task 2: Fan page visual upgrades + CSS vars
### Task 3: Artwork-derived ASCII (static + live)
### Task 4: Admin knobs + palette-tinted cards + API/preview wiring
### Task 5: Tests + build verification
