---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S14'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace review-rail-viewers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S14 and 2026-06-16-review-rail-viewers-plan placeholders are machine-filled by
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
     The Bind Shiki token colors to the OKLCH semantic token tier so light, dark, and high-contrast are three theme maps with no per-surface color and ## Scope

- `frontend/src/app/viewer/highlighterTheme.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Bind Shiki token colors to the OKLCH semantic token tier so light, dark, and high-contrast are three theme maps with no per-surface color

## Scope

- `frontend/src/app/viewer/highlighterTheme.ts`

## Description

- Define one Shiki theme whose token foregrounds are `var(--color-*)` references to the existing semantic token tier, so light, dark, and high-contrast are three token maps with no per-surface color — the DOM resolves the `var()` chain against the active `[data-theme]`.
- Map TextMate scopes onto the warm low-chroma neutral ramp plus the single accent and the established state/tier hues, honoring warmth-lives-in-tokens — no bespoke syntax-color rainbow.

## Outcome

The token-bound theme repaints on theme switch with no re-tokenization; the probe test confirms the emitted foregrounds reference `var(--color-*)`.

## Notes

None.
