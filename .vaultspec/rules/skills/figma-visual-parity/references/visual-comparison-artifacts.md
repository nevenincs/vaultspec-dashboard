# Visual comparison artifacts

Generate split / overlay / diff PNGs + a JSON report, then an optional HTML review
page. Compositing uses browser-native Canvas through Playwright — **no native image
packages** (`canvas`, `sharp`, `pngjs`, `jimp`) are required or used.

All examples below use a placeholder surface (slug `hero`, node `12:345`, `1280x720`);
substitute your own slug, node id, and dimensions.

## Compare

```
node ${CLAUDE_SKILL_DIR}/scripts/compare-pngs.mjs \
  --figma output/visual-compare/hero-figma-12-345.png \
  --live  output/visual-compare/hero-live-1280x720.png \
  --slug  hero \
  --out   output/visual-compare \
  --threshold 24
```

Produces, under `--out`:

- `<slug>-split-<dims>.png` — Figma | Live, side by side with a labelled header.
- `<slug>-overlay-alpha-<dims>.png` — both images blended at 0.55 alpha.
- `<slug>-diff-<dims>.png` — directional difference map (same dimensions): **green** =
  content in the design the live build is missing; **magenta** = content the live build
  added that the design lacks; faint gray = unchanged. Magenta+green is chosen for
  colorblind-safety and vision-model legibility (saturated, luminance-distinct, survives
  downsampling — unlike a subtle single-hue gradient).
- `<slug>-visual-compare-report.json` — dimensions + pixel-delta stats.

Report shape:

```json
{
  "figma": { "path": "...", "file": "hero-figma-12-345.png", "width": <px>, "height": <px> },
  "live":  { "path": "...", "file": "hero-live-<w>x<h>.png", "width": <px>, "height": <px> },
  "compare": { "width": <px>, "height": <px>, "resized": false },
  "artifacts": { "split": {...}, "overlay": {...}, "diff": {...} },
  "pixelDelta": {
    "threshold": 24,
    "changedPixelsOverThreshold": <count>,
    "missingInLive": <count>,
    "extraInLive": <count>,
    "totalPixels": <count>,
    "changedRatio": <0..1>,
    "meanMaxChannelDelta": <0..255>
  }
}
```

`changedRatio` and `meanMaxChannelDelta` quantify divergence; they are evidence, not
a pass/fail verdict. Always visually inspect the overlay and diff and describe the
concrete differences.

## Review page

```
node ${CLAUDE_SKILL_DIR}/scripts/write-review-page.mjs \
  --slug hero --width 1280 --height 720 \
  --out output/visual-compare \
  --figma-file hero-figma-12-345.png \
  --figma-label "Figma <node-id>" --live-label "Live <route>"
```

Writes `<slug>-visual-compare.html`: a no-server page (relative paths, opens from a
file browser) with an opacity slider over the direct overlay, plus the split and diff
images. Pass `--figma-file` so the overlay's underlay points at the exact downloaded
Figma PNG (its name carries the node id).

## One-shot orchestrator

`run-parity.mjs` runs capture → compare → review in sequence once you have the
downloaded Figma PNG and its dimensions:

```
node ${CLAUDE_SKILL_DIR}/scripts/run-parity.mjs \
  --slug hero --url <your-live-url> \
  --figma output/visual-compare/hero-figma-12-345.png \
  --width <w> --height <h> --wait-ms 6500
```

Flags forwarded to the underlying scripts:

- `--out <dir>` — output directory (default `output/visual-compare`).
- `--selector "<css>"` — wait for this element before capturing (deterministic readiness).
- `--threshold <n>` — per-pixel max-channel delta that counts as changed (default 24).
- `--no-webgl` — skip the WebGL/SwiftShader launch flags for plain DOM pages.
- `--no-review` — skip the HTML review page; produce only the PNGs + JSON report.
- `--allow-resize` — scale the live capture onto the Figma dimensions instead of failing on a size mismatch.
