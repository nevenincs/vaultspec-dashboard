---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- PHASE SUMMARY:
     This file rolls up every <Step Record> belonging to one Phase
     of the originating plan. Each Step (S##) in the Phase produces
     one <Step Record> in `.vault/exec/`; this summary aggregates
     them, lists modified / created files across the Phase, and
     reports verification status. -->

# `figma-parity-reconciliation` `W01.P01` summary

Phase W01.P01 closed the non-color DTCG token pipeline and adopted the binding Figma foundation across type, radius, elevation, and spacing. All ten Steps (S01 to S10) are closed. The four foundation families are now authored as DTCG sources and generate mechanically into the marked stylesheet region exactly as color already does, the Figma mirror carries them alongside color, Inter and JetBrains Mono are bound as the identity faces, and every divergent usage was reconciled to the Figma scale.

- Created: `frontend/tokens/type.tokens.json` (S01)
- Created: `frontend/tokens/radius.tokens.json` (S02)
- Created: `frontend/tokens/elevation.tokens.json` (S03)
- Created: `frontend/tokens/spacing.tokens.json` (S04)
- Modified: `frontend/tokens/resolver.json` and the Style Dictionary build, the shared declaration parser, the drift gate, and the token tests (S05)
- Modified: `frontend/tokens/figma/tokens.json` and the Figma export generator (S06)
- Modified: `frontend/src/styles.css` (the webfont load, the Tailwind font binding, and the radius, elevation, and type alias blocks, all co-located in the single stylesheet and shipped under S05) (S07 to S10)

## Description

S01 to S04 authored the four DTCG sources. The type source carries the binding role names (display, title, body, body-strong, label, meta, caption, mono) with the binding size, line-height, and weight metrics and the two bound font families; the title role intentionally maps to the legacy 15px metric so the downstream collision guard can keep the legacy 13px section-label bound to body-strong. The radius source carries the Figma xs4, sm5, md7, lg10, pill18 scale (md retuned 6px to 7px, the new pill 18px added). The elevation source carries the three Figma levels (raised, overlay, popover), collapsing the prior six-level scale while reusing the existing drop-shadow geometries. The spacing source is a value-preserving promotion of the already-matching 4-base scale into the generated pipeline.

S05 extended the Style Dictionary build with a third generated marker region (foundation) inside the static theme block, emitting font-family, per-role type, radius, base elevation shadow, and spacing custom properties; it bound the Tailwind font and text namespaces to the generated foundation, extended the drift gate to guard the new region, and hardened the shared declaration parser to coalesce prettier-wrapped multi-line values so wrapping is not reported as drift. S06 extended the Figma mirror to carry the four non-color families as Tokens Studio composites (typography, font-family, borderRadius, boxShadow, spacing) in an always-active foundation set. S07 adopted Inter and JetBrains Mono as the bound faces with the prior system stack retained as a fallback tail.

S08 to S10 migrated the divergent usages. Per the ADR direction, the migration applied an alias-over-sweep strategy rather than a mechanical class sweep: the legacy elevation, radius, and type names were kept as deprecated aliases onto the Figma scales so the current app stays visually stable and green, with the real per-surface usage cutover deferred to the W02 chrome and W03 scene rewrites and the aliases removed in W04. S10 resolved the load-bearing text-title versus text-heading collision: the legacy text-title utility stays bound to the legacy 13px (body-strong metrics) and the binding 15px Figma title is reached as the legacy text-heading and as the canonical title foundation token, so no usage mis-binds.

## Verification

The full frontend lint gate passes at exit 0 (eslint, prettier, tsc, the extended token-drift check covering color and foundation, and the figma-registry check), and the token tests pass. Each Step shipped as its own commit: `6e99693` (S01), `ad0950b` (S02), `8e4423c` (S03), `29a2073` (S04), `7be4f62` (S05), `ee1df23` (S06), `006a022` (S07), `d1063e0` (S08), `6f2d70a` (S09), `0dea92b` (S10). Wave W01 was reviewed PASS with no CRITICAL or HIGH findings.

## Carried forward

The alias-over-sweep decision is the load-bearing carry-forward: the elevation, radius, and type families are reconciled by deprecated aliases, not by sweeping usages in files the rewrite Waves will discard. The real per-surface cutover to the raised/overlay/popover, xs4/sm5/md7/lg10/pill18, and Figma role tokens lands in W02 and W03, and the legacy aliases are removed in W04. The rounded-full to pill18 re-key is intentionally deferred to the rewrite as a per-shape decision. The Inter and JetBrains Mono webfonts load via a stylesheet @import with display swap and the prior system stack as a fallback tail; if a future hardening prefers self-hosted faces, that is a bundling change outside this phase's token scope.
