---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S23'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize keycap display

## Scope

- The keycap presentation and shared action accelerator contracts
- Six shortcut and accelerator derivation paths
- Five React rendering boundaries and owner tests
- Common keycap catalog, message policy, and alternate-locale resources
- The exact localization scanner baseline

## Description

- Preserve canonical chord parsing, formatting, matching, event handling, persistence, IDs, and dispatch behavior.
- Replace resolved accelerator strings with one bounded typed keycap presentation sequence.
- Map known modifiers and named keys to catalog descriptors while retaining safe literal glyphs, printable Unicode graphemes, symbols, digits, and function keys.
- Reject malformed, overlong, invisible, bidirectional-formatting, control, and unknown multi-character display tokens without exposing raw input.
- Carry typed accelerators through action and store projections without resolving locale copy.
- Resolve keycap messages only at context-menu, palette, shortcut, settings, and document React boundaries.
- Localize the complete document edit-mode tooltip with named accelerator interpolation.
- Remove the platform-mutation test seam and pass platform behavior explicitly to pure derivations.
- Add backward-compatibility tests for non-ASCII canonical bytes, Shift stripping, and matching.

## Outcome

Visible key names now follow the active locale without changing canonical shortcut identity or persisted overrides. Missing or malformed display data suppresses the hint instead of exposing raw tokens, while valid international keyboard graphemes remain visible.

Sol's affected suite passed 186 tests across 16 files. Independent Terra review passed 109 focused tests and the complete frontend lint recipe. TypeScript, ESLint, Prettier, the localization scanner, diff checks, token checks, and design-system checks all passed. The scanner baseline decreased from 1,484 to 1,476 exact findings through eight DocChrome literal removals, with no additions.

## Notes

Independent review initially found that Unicode display support had changed canonical non-ASCII matching and that localized keycaps were composed into an English tooltip. Sol restored the identity path exactly, added compatibility golden tests, and moved the full tooltip into the catalog. Terra re-reviewed the corrections and approved the step with no open findings.
