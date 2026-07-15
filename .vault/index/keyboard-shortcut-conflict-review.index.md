---
generated: true
tags:
  - '#index'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P01-S01]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P01-S02]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P01-S03]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P01-summary]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P02-S04]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P02-S05]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P02-S06]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P02-summary]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P03-S07]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P03-S08]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P03-summary]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P04-S09]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P04-S10]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-P04-summary]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-adr]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-audit]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-plan]]'
  - '[[2026-07-15-keyboard-shortcut-conflict-review-research]]'
---

# `keyboard-shortcut-conflict-review` feature index

Auto-generated index of all documents tagged with `#keyboard-shortcut-conflict-review`.

## Documents

### adr

- `2026-07-15-keyboard-shortcut-conflict-review-adr` - `keyboard-shortcut-conflict-review` adr: `one scope-aware conflict definition, a platform-reserved denylist, and three cross-platform chord fixes` | (**status:** `accepted`)

### audit

- `2026-07-15-keyboard-shortcut-conflict-review-audit` - `keyboard-shortcut-conflict-review` audit: `conflict definition, denylist, and re-chords review` | APPROVED

### exec

- `2026-07-15-keyboard-shortcut-conflict-review-P01-S01` - Export the specificity helper and narrow findConflicts/conflictsForCandidate to equal-specificity pairs, stating the formal conflict definition in the module comment (D1)
- `2026-07-15-keyboard-shortcut-conflict-review-P01-S02` - Rewrite the conflicts guard onto the shared predicate (delete its local specificityRank) and add settings-control cases: empty presentations for the ten previously-flagged stock rows, plus a synthetic same-specificity override collision that still warns (D2)
- `2026-07-15-keyboard-shortcut-conflict-review-P01-S03` - Record the D8 amendment notes on keyboard-action-system decision 7 and audit finding KAR-008 via body-prose amendment blocks
- `2026-07-15-keyboard-shortcut-conflict-review-P01-summary` - `keyboard-shortcut-conflict-review` `P01` summary
- `2026-07-15-keyboard-shortcut-conflict-review-P02-S04` - Create the reserved-chords module (Mod+1..9, Mod+W/T/N/Q, macOS Cmd+H/M/Q, Mod+P
- `2026-07-15-keyboard-shortcut-conflict-review-P02-S05` - Re-chord right-rail tab switching Mod+1/Mod+2 to Mod+Alt+1/Mod+Alt+2 with reservation comments, updating keybinding and action tests (D4)
- `2026-07-15-keyboard-shortcut-conflict-review-P02-S06` - Re-chord the search palette Mod+P to Mod+Shift+P with a reservation comment, updating palette and localization tests (D5)
- `2026-07-15-keyboard-shortcut-conflict-review-P02-summary` - `keyboard-shortcut-conflict-review` `P02` summary
- `2026-07-15-keyboard-shortcut-conflict-review-P03-S07` - Add the isComposing (and keyCode 229 fallback) early-out before context resolution, with a dispatcher test proving a bound bare-key chord does not fire mid-composition (D6)
- `2026-07-15-keyboard-shortcut-conflict-review-P03-S08` - Document the no-AltGr-symbol-defaults convention in the chord module comment and flag the two live Mod+Alt bracket defaults with the accepted-risk note and return trigger (D7)
- `2026-07-15-keyboard-shortcut-conflict-review-P03-summary` - `keyboard-shortcut-conflict-review` `P03` summary
- `2026-07-15-keyboard-shortcut-conflict-review-P04-S09` - Run the full frontend gate and the existing keymap/navigation suites unchanged, confirming the Class A/B split and canvas-shadow behavior are preserved
- `2026-07-15-keyboard-shortcut-conflict-review-P04-S10` - Route the completed diff through vaultspec-code-review and persist the audit
- `2026-07-15-keyboard-shortcut-conflict-review-P04-summary` - `keyboard-shortcut-conflict-review` `P04` summary

### plan

- `2026-07-15-keyboard-shortcut-conflict-review-plan` - `keyboard-shortcut-conflict-review` plan

### research

- `2026-07-15-keyboard-shortcut-conflict-review-research` - `keyboard-shortcut-conflict-review` research: `default shortcut conflicts and cross-platform review`
