---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S20'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-design-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S20 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Prove the Phosphor SVG to texture path against the GlyphTextureProvider seam as a spike, deferring full domain marks to a surface wave and ## Scope

- `frontend/src/scene/field/glyphs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Prove the Phosphor SVG to texture path against the GlyphTextureProvider seam as a spike, deferring full domain marks to a surface wave

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Read the existing texture seam: the `GlyphTextureProvider` interface in `nodeSprites.ts` and its `ProgrammaticGlyphs` implementation in `glyphs.ts`, which builds a Pixi `Graphics` and uploads it via `renderer.generateTexture(graphics)`, caching white silhouettes the sprite layer later tints.
- Authored a minimal, real spike under the existing `spike/` tree (already covered by the lint, format, and test globs): a module that turns one representative Phosphor SVG (the regular-weight git-commit mark, an icon the ADR adopts directly) into a Pixi `Graphics` via Pixi v8's `GraphicsContext.svg()`, then through the same `generateTexture` seam shape the placeholder provider uses.
- Exposed three surfaces so the path is testable without a live GPU: a pure SVG-to-`Graphics` parse with inspectable bounds, a GPU-free `Texture` allocation with deterministic dimensions, and the live `generateTexture` seam helper identical in shape to the placeholder provider.
- Wrote a passing test (DOM env, since Pixi's SVG parser needs `DOMParser`) asserting the SVG parses to non-empty geometry contained within Phosphor's 256-unit grid, and that the texture allocation yields a real `Texture` of the expected sprite dimensions.
- Captured the one real seam constraint the spike surfaced — Pixi's color parser rejects the literal `currentColor` keyword — as an explicit pair of tests plus a small `currentColor`-resolution helper, mirroring the placeholder provider's white-ink-then-tint contract.
- Ran the full lint gate (eslint, prettier, tsc) green and the full suite green, deferring the bespoke domain-mark set to the later surface wave as the plan and ADR direct.

## Outcome

The Phosphor-SVG-to-texture path is proven against the existing seam with a passing test, not a TODO. The path is: Phosphor SVG string, resolve `currentColor` to a tintable white ink, parse with `GraphicsContext.svg()` to a Pixi `Graphics`, then upload through the same `renderer.generateTexture` call the placeholder provider already makes. The texture half is asserted GPU-free via `RenderTexture.create`, which yields a real `Texture` with deterministic dimensions; the only untested fragment is the live GPU upload, exactly as the existing glyph tests leave the renderer call untested. No production rendering code changed — the foundation is laid for the domain marks without authoring them.

## Notes

Spike finding worth carrying into the surface wave and possibly the ADR: Phosphor's clean per-icon SVG ships with `fill="currentColor"`, and Pixi's SVG color parser throws on that CSS keyword because it resolves against a live cascade Pixi has no access to. The domain-mark pipeline must resolve `currentColor` to a concrete ink (white, matching the placeholder's tint contract) before parsing. The ADR states the `currentColor` source "feeds both the React chrome and the Pixi/sigma texture seam" as if directly; for the chrome (real CSS cascade) that holds, but the texture seam needs this one-line substitution first — a minor refinement to the ADR's texture-plane prose, not a decision change. No other incidents; no skipped work; no scaffolds left in production code (the spike lives under `spike/`, the project's sanctioned spike home).
