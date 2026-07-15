---
tags:
  - '#research'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - '[[2026-06-19-keyboard-action-system-adr]]'
  - '[[2026-06-21-keyboard-navigation-adr]]'
  - '[[2026-07-02-keyboard-action-correctness-review-audit]]'
---

# `keyboard-shortcut-conflict-review` research: `default shortcut conflicts and cross-platform review`

The user reports the shortcut settings surface (reached through the Cmd+K
palette) explicitly flags conflicting shortcuts on a stock install; the law is
that DEFAULT shortcuts must never conflict, and the campaign target is an
extensive shortcut review that holds on all platforms and browsers. Research
conducted by a delegated read-only researcher: rag-grounded, epicenter files
read whole, and the existing conflict guard run live (3/3 green) to confirm
behavior rather than assume it.

## Findings

### Two competing definitions of "conflict" — the recorder's is wrong

The alert the user sees is the Settings keyboard-shortcuts recorder catalog
(`app/settings/controls/KeybindingControl.tsx`), which calls
`keybindingConflictPresentations` (`stores/view/settingsControls.ts`) on every
row's current effective chord. That resolves through `conflictsForCandidate`
(`platform/keymap/registry.ts`), which flags ANY other binding with the same
canonical chord whose context overlaps (`contextsOverlap`; global overlaps
everything) — with NO specificity awareness.

The static guard (`stores/view/defaultKeybindingConflicts.guard.test.ts`)
deliberately narrows `findConflicts()` to SAME-SPECIFICITY pairs, excepting
global-vs-surface pairs as the deliberate resolvable shadow, because the
dispatcher's most-specific-context-wins rule (`resolveKeybinding`) makes them
correct at runtime. That faithfully implements finding KAR-008 of the
keyboard-action correctness audit — but the audit's scope never extended to
the Settings recorder's live indicator. Runtime behavior is right; the
recorder lies about it.

### The false-positive inventory (stock install, zero overrides)

Five deliberate global-vs-canvas shadow pairs render red "conflict" alerts on
ten rows: `ArrowLeft/Right/Up/Down` (nav neighbor/feature cycling vs graph
walk, `stores/view/keyboardNavigation.ts` vs `app/stage/graphWalkKeybindings.ts`)
and bare `E` (`working-set:expand-selection` in `stores/view/workingSet.ts` vs
`graph:expand`). TRUE same-specificity collisions in the ~40 defaults across
18 registration sources: none found.

### Real cross-platform defects and risks

- `Mod+1`/`Mod+2` (right-rail tab switching, `stores/view/rightRailKeybindings.ts`)
  is DEAD ON ARRIVAL: Ctrl/Cmd+1..8 are hard-reserved by every major browser
  for browser-tab switching and intercepted before the page keydown fires.
  Pressing it switches the user's browser tab. A real defect, unflagged in
  code, unlike the deliberate `Mod+W`/`Mod+R` avoidances elsewhere.
- `Mod+P` (search palette, `stores/view/commandPalette.ts`) sits on browser
  Print, preventable in most browsers but inconsistent (Firefox/Safari), and
  carries none of the reservation notes the codebase's convention uses.
- AltGr is unhandled: on Windows/EU layouts AltGr emits `ctrlKey+altKey`, so
  `Mod+Alt+[`/`Mod+Alt+]` (left-rail tree expand/collapse) and the doc-tab
  chords can misfire or fail on layouts where those symbols themselves
  require AltGr. Nothing in `platform/keymap/chord.ts` compensates.
- Bare-key GLOBAL bindings (`E`, `Backspace` in the working set; `?` legend)
  rely on the dispatcher's text-entry gate; focusable non-form surfaces and
  IME composition are uncovered — inherently higher accidental-fire risk.
- `F6`/`Shift+F6` region cycling is deliberate and APG-compliant, but on Mac
  laptops bare F-keys default to hardware functions (needs Fn) — a caveat to
  state, not a bug.
- Chord model: `Mod` = meta on Mac / ctrl elsewhere; symbol chords skip the
  Shift comparison because `event.key` is layout-aware — sound for most
  layouts, silent on the AltGr class above.

### Prior art

The `?` legend derives from `listKeybindings()` + overrides and shows NO
conflict markers — the legend and the recorder currently disagree about the
same pairs. VS Code-class prior art (general knowledge, unverified) treats
scope-disjoint chords as non-conflicting by definition (when-clause aware
conflict detection), matching remediation O2.

## Remediation options (for the ADR)

- **O1 — re-chord shared defaults.** Trivially satisfies both checkers; but
  forecloses the DESIRED arrows-walk-the-graph-on-canvas UX — a regression,
  not a fix, except where a re-chord is genuinely free.
- **O2 — one formal, scope-aware conflict definition** (same-specificity /
  non-mutually-exclusive contexts only), consumed by the recorder
  (`keybindingConflictPresentations`) and the guard alike. Fixes the reported
  bug with zero UX cost; must keep flagging genuinely bad USER overrides
  (two globals on one chord).
- **O3 — strengthened static guard + platform-reserved denylist**
  (Mod+1..9, Mod+W/T/N/Q, macOS Cmd+H/M/Q, …) so a future default can't
  reintroduce a dead binding; catches the `Mod+1` class in CI. Needs list
  upkeep; does not itself fix the recorder.
- **O4 — per-platform default maps** (VS Code-style). Biggest scope: touches
  the registry's one-chord-per-action model, recorder, legend, fixtures;
  overkill unless a specific chord proves unsatisfiable on all platforms.

Researcher recommendation: O2 + O3 together, O1 narrowly where free (the
`Mod+1`/`Mod+2` rail tabs MUST re-chord regardless — theirs is a reservation
problem, not a semantics problem), O4 deferred.

## Key sites

`platform/keymap/registry.ts` (`findConflicts`, `conflictsForCandidate`,
`contextsOverlap`, `resolveKeybinding`); `stores/view/settingsControls.ts`
(the bug site); `stores/view/defaultKeybindingConflicts.guard.test.ts` (O3's
model); `stores/view/rightRailKeybindings.ts` (the dead chords);
`stores/view/commandPalette.ts` (`Mod+P`); `app/stage/graphWalkKeybindings.ts`,
`stores/view/keyboardNavigation.ts`, `stores/view/workingSet.ts` (the shadow
pairs). Engine-side `keybindings` setting is unaffected — frontend-only fix.
