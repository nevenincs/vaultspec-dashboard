---
derived_from:
  - "audit:2026-07-15-keyboard-shortcut-conflict-review-audit"
---

# Rule

Vet every NEW default keybinding chord at selection time — against the
reserved-chords module, the macOS `Cmd+Opt`/system-shortcut class, and the
in-app chord-family inventory — before it is authored; the denylist guard can
only catch a chord that is already listed.

## Why

During the 2026-07-15 shortcut-conflict review, three successive replacement
chords each failed on a reservation nobody had listed yet: `Mod+Shift+P`
(Firefox New Private Window), `Mod+Alt+P` (taken in-app by project browse),
and `Mod+Alt+D` (macOS `Cmd+Opt+D` Show/Hide Dock). The CI guard over
`frontend/src/platform/keymap/reservedChords.ts` proves defaults against the
KNOWN list; selection-time diligence is the only control against unknown
reservations.

## How

Applied: before binding a new default, (1) check
`frontend/src/platform/keymap/reservedChords.ts` and add any newly confirmed
reservation with a citation; (2) check the macOS `Cmd+Opt` letter class —
known-reserved letters include B (Safari bookmarks editor), K (Firefox Web
Console), E (Safari Empty Caches), C (Chrome inspect element), D (Show/Hide
Dock), H/M (window management); (3) grep the full default-chord inventory
(`assembleDefaultKeybindings.testsupport.ts` names every registration source)
for in-app collisions at equal specificity; (4) never choose a
`Mod+Alt+<symbol>` default where the symbol requires AltGr on common EU
layouts; (5) record the vetting outcome in the binding's reservation comment.

Violated: picking "the next free letter" in a chord family because the two
guards pass — that is exactly how `Mod+Shift+P` and `Mod+Alt+D` shipped and
had to be review-caught; the guards were green both times because the
reservations were not yet listed.
