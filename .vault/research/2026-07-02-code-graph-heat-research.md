---
tags:
  - '#research'
  - '#code-graph-heat'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-code-timeline-range-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace code-graph-heat with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `code-graph-heat` research: `ranked code node coloring`

<!-- Brief description of what was researched, why, and how it relates to
`code-graph-heat`. -->

User directive: a ranked, heatmap-like coloring of the code file graph, driven by
the best available per-node data, using proper theme colors with gradients between
them. Researched: candidate ranking metrics on the served code corpus, and the
scene's node-color pipeline (how colors are assigned, themed, and rebuilt).

## Findings

### Candidate ranking metrics

- **Worktree-mtime recency** — just plumbed end to end (`dates.modified` on every
  code file node, code-timeline-range ADR): universally present, meaningful
  ("what is being worked on"), timeline-consistent (the same axis the range strip
  narrows), and rank-normalizable engine-side. The strongest candidate.
- **Import degree** — `degree_by_tier` is already served per node; measures
  architecture (hubs) rather than activity; hubs are ALREADY emphasized by node
  size via the salience scale, so a degree color would double-encode.
- **File size** — not currently served on the node view; weak signal for a
  primary color axis.
- Precedent: the vault's salience family (`graph-node-salience` ADR) establishes
  that rankings are ENGINE-computed and served, never client-derived, and drive
  node SIZE. Color is the free channel on code nodes.

### Scene node-color pipeline (as-built)

- Colors bake at build time: `buildNodes` → `nodeColorNumber(node)` →
  `cssColorNumber` reads literal-hex scene tokens via getComputedStyle → written
  into the `aColor` instanced attribute; `nodeColors[]` is the CPU cache edge
  end-colors and glyph inks derive from.
- A code node with a served `module_hue` colors by
  `mixHexToward(categoryPaletteHue(hue), canvasBackground(), depth × 0.12 ≤ 0.55)`
  — hue = module identity, lightness = path depth. Long-tail/undated fall back to
  `categoryColor("code")`.
- Tokens: the scene reads `--color-scene-category-*`, `--color-canvas-bg`,
  `--color-ink(-muted)`, `--color-scene-rule`, `--color-accent`; each emitted as
  literal hex per theme in `styles.css`. NO ramp/heat/sequential token set exists.
- Interpolation: `mixHexToward` (tested per-channel sRGB lerp) is the one color
  mixer; culori is a dependency but only `parse`/`converter("rgb")` are typed —
  no OKLCH interpolation path exists yet.
- Appearance params flow `set-appearance-params` → `setAppearanceParams`; ONE
  enum param exists (`edgeColorMode: solid|gradient`, schema-declared, rendered
  as a SegmentedToggle in the graph controls). Node `aColor` has NO live rewrite
  path today — node colors re-bake only via `setData` or `rebuildGLResources()`
  (the refresh-theme path, which re-reads every token and preserves layout).
- The code legend (`CategoryLegend` code branch) renders discrete module-hue
  swatches; no gradient-ramp legend precedent exists anywhere.
- Control values persist via the `graph_controls` setting automatically for any
  schema-declared control.
