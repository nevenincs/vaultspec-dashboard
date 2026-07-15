---
tags:
  - '#plan'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
tier: L2
related:
  - '[[2026-07-15-keyboard-shortcut-conflict-review-adr]]'
---








# `keyboard-shortcut-conflict-review` plan

### Phase `P01` - Scope-aware conflict definition

One formal equal-specificity conflict predicate in the registry, consumed by the Settings recorder and the guard alike, with the D8 amendment notes on the priors (ADR D1, D2, D8)



- [x] `P01.S01` - Export the specificity helper and narrow findConflicts/conflictsForCandidate to equal-specificity pairs, stating the formal conflict definition in the module comment (D1); `frontend/src/platform/keymap/registry.ts`.
- [x] `P01.S02` - Rewrite the conflicts guard onto the shared predicate (delete its local specificityRank) and add settings-control cases: empty presentations for the ten previously-flagged stock rows, plus a synthetic same-specificity override collision that still warns (D2); `frontend/src/stores/view/defaultKeybindingConflicts.guard.test.ts, frontend/src/stores/view/settingsControls.test.ts`.
- [x] `P01.S03` - Record the D8 amendment notes on keyboard-action-system decision 7 and audit finding KAR-008 via body-prose amendment blocks; `.vault/adr/2026-06-19-keyboard-action-system-adr.md, .vault/audit/2026-07-02-keyboard-action-correctness-review-audit.md`.

### Phase `P02` - Platform-reserved denylist and re-chords

Codify the browser/OS-reserved chord set with a CI guard and land the two re-chords off dead or unreliable chords (ADR D3, D4, D5)

- [x] `P02.S04` - Create the reserved-chords module (Mod+1..9, Mod+W/T/N/Q, macOS Cmd+H/M/Q, Mod+P; `per-entry reservation citations) and the denylist guard over the assembled default set with a synthetic has-teeth case (D3); `frontend/src/platform/keymap/reservedChords.ts, frontend/src/stores/view/reservedKeybindingDenylist.guard.test.ts`.
- [x] `P02.S05` - Re-chord right-rail tab switching Mod+1/Mod+2 to Mod+Alt+1/Mod+Alt+2 with reservation comments, updating keybinding and action tests (D4); `frontend/src/stores/view/rightRailKeybindings.ts`.
- [x] `P02.S06` - Re-chord the search palette Mod+P to Mod+Shift+P with a reservation comment, updating palette and localization tests (D5); `frontend/src/stores/view/commandPalette.ts`.

### Phase `P03` - Dispatcher IME gate and AltGr guardrail

Close the composition gap at the one dispatcher gate and document the AltGr posture with its return trigger (ADR D6, D7)

- [x] `P03.S07` - Add the isComposing (and keyCode 229 fallback) early-out before context resolution, with a dispatcher test proving a bound bare-key chord does not fire mid-composition (D6); `frontend/src/stores/view/keymapDispatcher.ts`.
- [x] `P03.S08` - Document the no-AltGr-symbol-defaults convention in the chord module comment and flag the two live Mod+Alt bracket defaults with the accepted-risk note and return trigger (D7); `frontend/src/platform/keymap/chord.ts, frontend/src/stores/view/leftRailKeybindings.ts`.

### Phase `P04` - Verification

Full gate plus the unchanged keymap and navigation suites, then mandatory code review with a persisted audit

- [x] `P04.S09` - Run the full frontend gate and the existing keymap/navigation suites unchanged, confirming the Class A/B split and canvas-shadow behavior are preserved; `frontend/`.
- [x] `P04.S10` - Route the completed diff through vaultspec-code-review and persist the audit; `.vault/audit/2026-07-15-keyboard-shortcut-conflict-review-audit.md`.

## Description


## Steps







## Parallelization


## Verification

