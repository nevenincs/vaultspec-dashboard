---
tags:
  - '#exec'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S04'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
---




# Create the reserved-chords module (Mod+1..9, Mod+W/T/N/Q, macOS Cmd+H/M/Q, Mod+P

## Scope

- `per-entry reservation citations) and the denylist guard over the assembled default set with a synthetic has-teeth case (D3)`
- `frontend/src/platform/keymap/reservedChords.ts`
- `frontend/src/stores/view/reservedKeybindingDenylist.guard.test.ts`

## Description

- Create the reserved-chords module (Mod+1..9, Mod+W/T/N/Q, Mod+H/Mod+M for macOS, Mod+P; per-entry reservation citations; isReservedChord helper) and the denylist guard over the assembled default set with an inject-Mod+1 has-teeth case.

## Outcome

No default chord can ship browser/OS-dead again (ADR D3); macOS-only limitation of the chord model documented.

## Notes
