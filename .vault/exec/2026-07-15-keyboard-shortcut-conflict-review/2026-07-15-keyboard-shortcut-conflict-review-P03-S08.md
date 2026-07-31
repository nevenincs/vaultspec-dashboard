---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-17'
body_hash: 'sha256:21005272f70a7c53df2f09c55cb33dab8217e76ecb40f61ff9fac575ef4790d4'
step_id: 'S08'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---

# Document the no-AltGr-symbol-defaults convention in the chord module comment and flag the two live Mod+Alt bracket defaults with the accepted-risk note and return trigger (D7)

## Scope

- `frontend/src/platform/keymap/chord.ts`
- `frontend/src/stores/view/leftRailKeybindings.ts`

## Description

- Document the no-AltGr-symbol-defaults convention in the chord module comment; flag both live Mod+Alt bracket defaults with accepted-risk notes citing ADR D7 and its return trigger.

## Outcome

AltGr posture recorded as reviewer-enforced convention plus flagged instances (ADR D7); no chord-model redesign attempted.

## Notes
