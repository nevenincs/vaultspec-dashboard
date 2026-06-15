---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S11'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S11 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The declare per-theme literal-hex status tokens and the scene reader and ## Scope

- `frontend/src/styles.css` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# declare per-theme literal-hex status tokens and the scene reader

## Scope

- `frontend/src/styles.css`

## Description

- Declare the three new scene-read status tokens (`--color-status-provisional`, `--color-status-graded`, `--color-status-tiered`) as literal hex in the static color namespace and in all three theme blocks (light, dark, high-contrast), keeping them warm-neutral and never a `var()` chain.
- Reuse the existing `--color-state-active`/`--color-state-archived` tokens for affirmed/retired/negated where the status-token map already points at them, so only the three genuinely-new names are added.

## Outcome

The scene reader resolves each status tint as literal `#rrggbb` per theme, satisfying the literal-hex scene-seam contract that the canvas `getComputedStyle` readers depend on. Diff red is untouched and no second accent was introduced; warmth stays in the token tier.

## Notes

The tokens that `stampToken` already maps to `--color-state-*` were deliberately not duplicated; only the provisional/graded/tiered names are new, defined once in the static block and overridden per theme.
