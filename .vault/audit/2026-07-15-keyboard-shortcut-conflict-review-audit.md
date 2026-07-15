---
tags:
  - '#audit'
  - '#keyboard-shortcut-conflict-review'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-keyboard-shortcut-conflict-review-plan]]"
  - "[[2026-07-15-keyboard-shortcut-conflict-review-adr]]"
---

# `keyboard-shortcut-conflict-review` audit: `conflict definition, denylist, and re-chords review` | APPROVED

## Scope

Independent three-round code review of the keyboard-shortcut-conflict-review
campaign against its accepted ADR (D1-D8) and plan: the scope-aware conflict
predicate in `platform/keymap/registry.ts` consumed by the Settings recorder
and the CI guard; the platform-reserved denylist (`platform/keymap/
reservedChords.ts`) and its guard; the default re-chords
(`rightRailKeybindings.ts`, `commandPalette.ts`, `editorKeybindings.ts`); the
dispatcher IME gate; the AltGr guardrail; and the amendment notes on the two
prior decision records. Reviewer-verified independently each round: tsc,
eslint, targeted vitest (final gate 7 suites / 81 tests including both guards
and `actionCoverage.guard`), and a trace of the dispatcher's context model
confirming two distinct surface contexts can never be simultaneously active —
which grounds the predicate's central claim against the real runtime.

## Findings

### mod-shift-p-firefox | high | The first replacement search chord was itself browser-reserved

Round 1: `Mod+Shift+P`, chosen to replace the print-reserved `Mod+P`, is
Firefox's chrome-level New Private Window — dead on arrival in Firefox, the
exact class the campaign exists to eliminate, and missing from both the
research and the denylist. RESOLVED: search landed on `Mod+Alt+S` after
`Mod+Alt+P` proved taken by the project-browse default; `Mod+Shift+P` and the
whole chrome-level `Mod+Shift` class (N/T/W/O/D/I/J/C/K) joined the denylist
with citations. The reviewer's own suggested alternative (`Mod+Shift+K`,
Firefox Web Console) was correctly rejected too.

### mod-shift-sweep | high-class follow-through | The finding's class swept across every Mod+Shift default

Round 2, orchestrator-directed from the round-1 class: `Mod+Shift+O`
(document-search) is Chrome's Bookmark Manager / Firefox's Library —
re-chorded to `Mod+Alt+F`; `Mod+Shift+D` (editor draft-diff) is Chrome's
bookmark-all-tabs — re-chorded; `Mod+Shift+R/G/X/F/L` verified clean with
reasoning (page-preventable or unreserved).

### mod-alt-d-macos-dock | high | The draft-diff replacement collided with a macOS system shortcut

Round 2 re-check: `Mod+Alt+D` resolves to `Cmd+Option+D` — Apple's documented
system-wide Show/Hide Dock shortcut, the same OS-reservation class already
denylisted for `Mod+H`/`Mod+M`. Unverifiable on real hardware from this
environment, so resolved defensively per the campaign's own standard:
re-chorded to `Mod+Alt+G` after vetting out the other free family candidates
(B = Safari bookmarks editor, K = Firefox mac Web Console, E = Safari Empty
Caches, C = Chrome mac inspect element, M/H = the Dock/window class);
`Mod+Alt+D` denylisted with the Apple citation. The vetted-out list is
recorded in the binding comment and an ADR amendment so the reasoning is
durable.

### guard-assembly-duplication | low | The two guards duplicated their default-set assembly

Round 1: `assembleDefaultKeybindings()` was byte-for-byte duplicated across
the two guard tests — the same drift class D1/D2 eliminate for the conflict
definition. RESOLVED round 2: hoisted to one shared test-support module both
guards import.

### verified-sound | none | Everything else confirmed on first pass

The scope-aware predicate (D1/D2) matches the runtime context model; the
canonicalization path is divergence-free between recorder capture and
dispatcher match; the recorder still warns on genuine same-specificity
override collisions; the IME early-out is unconditional, first, and
non-consuming (D6); `Mod+Alt+1/2` are collision-free including AltGr
reasoning (D4); the AltGr guardrail and accepted-risk flags match the ADR's
honest deferral (D7); the amendment blocks on the two priors are accurate
(D8).

## Recommendations

- Landed before approval (required): the three re-chords with their denylist
  entries, and the guard-assembly hoist.
- Durable lesson (candidate for codification): a NEW default chord must be
  vetted against the reserved-chords module AND the macOS `Cmd+Opt`/system
  class at selection time — the denylist guard can only catch a chord that is
  already listed, so selection-time diligence is the real control; three
  successive replacement chords each failed on a reservation nobody had
  listed yet.
- Shared-tree note at approval: the frontend recipe's module-size component
  remains breached only by a foreign campaign's uncommitted
  `authoring/approvals.rs`; every component this campaign touches exits 0.
  Mid-campaign the drive hit ENOSPC; the executor halted rather than delete
  shared build artifacts — correct behavior worth repeating.
