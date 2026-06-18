# Bounds, output location, and naming

## Size matching is mandatory

The live capture must use the same pixel dimensions as the Figma node. Comparing an
unconstrained desktop screenshot against a fixed-size Figma component creates false
positives and hides real layout issues.

```
viewport.width    = figma.width
viewport.height   = figma.height
deviceScaleFactor = 1
fullPage          = false
```

`compare-pngs.mjs` **fails by default** on a dimension mismatch. Only pass
`--allow-resize` when you have a deliberate, documented reason to compare against a
different breakpoint; the report then records `"resized": true`.

## Output location

Default output root:

```
output/visual-compare/
```

Override with `--out <directory>`. Never write comparison artifacts into `src/`,
`frontend/src/`, or a design-system folder — keep everything under
`output/visual-compare/` (or another explicit dev-artifact path) so it stays scoped
and reclaimable.

## File naming

Stable, descriptive names. Include a user-facing slug, the artifact role,
dimensions (for live/compare artifacts), and the Figma node id where useful.

```
<slug>-figma-<node-id-with-hyphen>.png
<slug>-live-<width>x<height>.png
<slug>-split-<width>x<height>.png
<slug>-overlay-alpha-<width>x<height>.png
<slug>-diff-<width>x<height>.png
<slug>-visual-compare-report.json
<slug>-visual-compare.html
```

Example (substitute your own slug, node id, and dimensions — here slug `hero`,
node `12:345`, `1280x720`):

```
hero-figma-12-345.png
hero-live-1280x720.png
hero-split-1280x720.png
hero-overlay-alpha-1280x720.png
hero-diff-1280x720.png
hero-visual-compare-report.json
hero-visual-compare.html
```

### Externally-supplied reference files

A Figma reference PNG you received (or captured under a different slug) **keeps its
own filename** — do not rename it to match your output slug. Pass its actual path to
`--figma`; `run-parity.mjs` forwards that basename to the review page as
`--figma-file` automatically, so the JSON report and the HTML overlay point at the
real reference regardless of slug. Only the artifacts you generate
(`<slug>-live/split/overlay/diff`) take the slug. A mixed-slug output set
(`timeline-figma-…` alongside `myslug-live-…`) is expected and correct in that case.

`compare-pngs.mjs` and `write-review-page.mjs` derive every name from `--slug` and
the compare dimensions, so passing a consistent slug yields this layout automatically.
