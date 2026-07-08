# Page style enhancements — design

## Goal

Upgrade every smartlink background and button style, add per-style customization knobs, and replace decorative ASCII with real artwork-derived ASCII that can animate.

## Decisions

- **Repo:** develop in `beamlink`, sync/deploy via `music-shortlink`.
- **Approach:** progressive enhancement — CSS-first SSR fan pages; optional small inline scripts for live ASCII only.
- **Admin QoL this pass:** style cards tinted from the real track palette + knobs driving live preview. No theme presets or manual palette editor.
- **ASCII:** SSR procedural fallback for first paint / no-JS; client samples cover art into a canvas mosaic; motion modes `static` | `shimmer` | `live`; `prefers-reduced-motion` forces static.

## Data model

Keep `links.page_background_style` and `links.button_style`.

Add `links.page_style_options` TEXT JSON:

```json
{
  "blur": { "intensity": 1, "saturate": 1 },
  "ascii": { "density": "md", "contrast": 0.7, "motion": "live" },
  "mesh": { "speed": 1, "intensity": 1 },
  "aurora": { "speed": 1, "intensity": 1, "blur": 1 },
  "vinyl": { "speed": 1, "intensity": 1 }
}
```

Missing keys use defaults. Invalid values clamp/normalize.

## Fan page

- Emit CSS custom properties from normalized options (`--fx-speed`, `--fx-intensity`, `--fx-blur`, `--ascii-contrast`, etc.).
- Upgrade aurora (more sheets, richer motion), mesh, vinyl, blur using those vars.
- ASCII: keep CSS overlay fallback; add canvas layer + inline script that samples `.artwork` / artwork URL.
- Buttons: light visual polish only (no new button knobs).

## Admin

- `PageStyleFields` receives palette vars; card previews use track colors.
- Advanced knobs panel appears for the selected background style.
- Preview draft + create/update APIs accept `pageStyleOptions`.

## Constraints

- No client framework on public pages.
- Meta CAPI / tracking unchanged.
- Reduced motion disables live ASCII and pauses/slows CSS effect animations.
