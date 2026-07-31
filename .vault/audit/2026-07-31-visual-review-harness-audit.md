---
tags:
  - '#audit'
  - '#visual-review-harness'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
body_hash: 'sha256:0f8d247997c8e4330b22b26ce3d76426b2b15e705f5988ff7a9643ce3ab0a5e0'
related:
  - "[[2026-07-30-visual-review-harness-adr]]"
  - "[[2026-07-30-visual-review-harness-plan]]"
  - "[[2026-07-30-visual-review-harness-research]]"
---

# `visual-review-harness` audit: `self-review of the harness, dev-domain fence, and tooling reconciliation`

## Scope and a limitation stated up front

## Scope

**This is a SELF-REVIEW, not an independent one.** A `vaultspec-code-reviewer` agent was
dispatched for the mandatory review and signalled idle twice without producing findings —
the same failure mode a Fable agent showed earlier in the session. Rather than block the
feature indefinitely or silently substitute my own pass for an independent one, this audit
is recorded and labelled for what it is. Its findings are real, but its independence is
not: the author reviewed the author's work, which is structurally weaker at catching
assumptions the author never questioned. **An independent review is still owed.**

Reviewed: the uncommitted `frontend/` change surface for the visual-review-harness feature.
Excluded: `engine/` and unrelated `.vault/` edits, which are another session's in-flight
work.

## Findings

### critical

None.

### high

None.

### medium

**VRH-001 — the matrix scale was hardcoded, contradicting its own stated design. FIXED.**

`dev/gallery/shell/Shell.tsx` computed cell scale from a literal `const available = 620`,
while `dev/gallery/matrix.ts` exported `REVIEW_SCREEN_WIDTH = 1920` that nothing consumed.
The module comment claimed cells were sized to fit a 1920-wide reviewer; the code used a
fixed 620px regardless of the actual window. On a narrower screen the grid would overflow
horizontally; on a wider one every specimen would be needlessly shrunk — and since the
iframe scale derives from this number, a wrong value misrepresents every element under
review.

Fixed by measuring the real grid column through the existing production hook
(`src/app/chrome/useElementWidth.ts`) rather than adding a second measurement mechanism,
with `REVIEW_SCREEN_WIDTH` now used as the pre-measurement fallback basis. Verified across
three screen widths: no horizontal overflow at 1920, 1440, or 1100, with the desktop cell
scaling 796 / 556 / 386 respectively.

### low

**VRH-002 — the coverage guard's non-component exclusion list is hand-maintained.**

`dev/gallery/coverage.guard.test.ts` filters kit exports through a literal
`NON_COMPONENT_EXPORTS` set. This is the same drift class the `covers` field was
deliberately designed to avoid: a new non-component export (a constant, a helper) fails the
guard until someone edits the list. The failure is LOUD and the fix is one line, so this is
noted rather than actioned — but it is an honest wart in a guard whose whole purpose is to
resist drift.

**VRH-003 — `dev/scratch` is retained but unmaintained.**

Five relocated scratch scripts (`dev/scratch/tmp-*.mjs`, `calib.mjs`) target ports 5176 and
5188 and a `three.html` that no longer exists at that path. They are dead. They were
rehomed rather than deleted because they are tracked files in a shared tree and deletion is
the user's call, and they are fenced out of eslint so they cannot fail the gate. They
should simply be deleted when someone confirms nobody wants them.

## Verified claims

Each ADR claim was checked against the code rather than taken on trust:

- **D1/D2 — modes rendered, not simulated.** `stateOverride` is gone from `src/`, not
  renamed: a grep for `stateOverride|modeOverride|forceState|previewState|__harness` across
  `src/` returns nothing. `StatusTabView` contains zero wire calls.
- **D6 — per-cell viewport and theme isolation.** Measured in-browser: the four cells report
  `innerWidth` 390/1440 with the app's own breakpoint resolving `compact`/`regular`
  correctly, each carrying its own `data-theme`.
- **D7 — the fence holds in the ARTIFACT, not just the scanner.** A production build was run
  and the emitted bundle grepped: no dev module and no lab copy present.
- **S15 — lab resolver safety.** Bypassing `resolveMessageResult` for lab keys does NOT
  forfeit the safe-fallback guarantee; `parseMissingKeyHandler` is instance-level
  (`src/platform/localization/runtime.ts:52`). Confirmed empirically against a runtime with
  registration deliberately omitted. No production key can take the lab path — no shipped
  key carries the `graph:lab.` prefix.
- **Gate and suite.** Frontend gate 8/8; full suite 467/467 files, 3774 passed, 1 skipped,
  exit 0. The `authoring.happyPath.live` failure seen in two earlier runs did not reproduce
  on a clean run and is a pre-existing full-suite flake, not a regression from this work.

## Known gaps, recorded rather than glossed

- **Nine mode-bearing surfaces are unenrolled** (`AgentPanel`, `DiffPanel`, `DiffView`,
  `ReviewStation`, `NodeInterior`, `CodeTree`, `FolderBrowser`, `CommandPalette`,
  `DocumentSearchSurface`). Each needs its own container/view split. "Renders every element"
  is therefore true of the kit and of two surfaces, not yet of the whole app.
- **`dev/tooling/fixtures` is excluded from typecheck and lint** by construction: it is
  deliberately-invalid source used as scanner input.
- **An unrelated staleness was found and left alone.** `frontend/tokens/figma/tokens.json`
  does not contain the `diff.modified-l`/`-d` tokens present in the DTCG source; the export
  needs regenerating by whoever owns that surface. It was restored to HEAD rather than
  regenerated here, to keep an unrelated Figma-bound change out of this feature's diff.

## Recommendations

1. **Commission an independent review.** This audit's central weakness is its authorship.
   The areas most worth an outside eye are the two casts in `dev/labs/three/labMessage.ts`
   and the false-negative surface of `dev/tooling/scan-domains.mjs` — in both cases the
   author chose the check, so the author is the worst person to judge what it misses.
2. **Split the nine remaining mode-bearing surfaces** one at a time, enrolling each as a
   registry entry once split. Until then, do not let "renders every element" be read as
   covering the whole app.
3. **Delete `dev/scratch` and the dead `dev/spike/index.html`** once someone confirms they
   are unwanted; they are provably dead and were retained only because deletion of tracked
   files is the user's call.
4. **Regenerate `tokens/figma/tokens.json`** under its owning feature, so the Figma export
   stops lagging the DTCG source.
5. **Consider deriving the coverage guard's non-component list** rather than maintaining it
   by hand (VRH-002), closing the last drift seam in the guard.
