---
tags:
  - '#audit'
  - '#plan-document-rendering'
date: '2026-06-29'
modified: '2026-06-29'
related:
  - "[[2026-06-29-plan-document-rendering-plan]]"
---

# `plan-document-rendering` audit: `verification of plan reader rendering + engine counting`

## Scope

Verification of the plan-document-rendering feature: the engine plan-interior rollup +
summary additions, the stores rewiring (and removal of client-side rollup math), the reader
plan summary card + step restyle, the Figma design, and the codified discipline.

## Findings

- **PASS — engine serves counts/rollups/state pre-truncation.** The plan-interior projection
  computes per-wave/phase rollups and a per-plan summary over the full tree before
  truncation, reusing the one completion-class authority (promoted to crate-visibility). Unit
  tests assert the rollup and summary totals are the TRUE pre-truncation totals on a
  deliberately oversized plan (the key correctness proof), and an API conformance test asserts
  the summary + rollup ride the wire through the shared envelope. `cargo test` (engine-query,
  vaultspec-api), fmt, and clippy are green.

- **PASS — the frontend undercount is closed.** The client-side rollup derivation was deleted;
  per-wave/phase rollups and the plan-level rollup now read from the wire (truncation-honest),
  and the stores adapter folds the new fields tolerantly. A regression-shaped test asserts the
  plan rollup is taken from the engine summary even when the served interior truncated (where
  the old client math would have undercounted).

- **PASS — reader renders the plan.** A self-fetching plan summary card mounts for plan
  documents (state badge, percentage + progress bar over served counts, wave/phase/step
  counts), composing the centralized kit. A markdown task-list override renders the shared
  step mark (extracted into the kit, now shared with the right rail): a filled check + muted,
  struck label for a done step and a hollow ring for a pending one. The reader component test
  asserts the marks render with the done/pending data attribute and no native checkbox; the
  summary-view derivation is unit-tested. The full frontend lint gate (eslint, prettier, tsc,
  px-scan, tokens, figma:names) and the affected vitest files are green.

- **PASS — live backend verification.** The running engine was confirmed serving the new
  fields for a real plan through the dev `api` proxy: a live plan returned a populated summary
  (wave/phase/step/done counts + a derived in-progress state) and non-zero per-wave/phase
  rollups, with no truncation. The reader's rendered card was not auto-screenshotted because
  the command-palette document search depends on the semantic tier, which was degraded in the
  running instance; the card is covered by component + derivation tests and the live-served
  data.

- **PASS — design.** The plan reader treatment (summary card + step vocabulary) was authored
  in the binding Figma file as a named surface frame composing the real kit progress
  component with variable-bound colors.

## Recommendations

- When the semantic tier is healthy, capture a live reader screenshot of the rendered plan
  summary card for visual-parity records against the Figma surface.
- Commit this feature's files as an isolated change; the working tree currently mixes
  unrelated prior uncommitted work.

## Codification candidates

- **Source:** the frontend-rollup-over-truncated-interior finding. **Rule slug:**
  `display-state-is-backend-served-not-frontend-derived` (EXISTING — sharpened in place, not
  a new rule, per the first-encounter discipline). **Rule:** a displayed/filtered count,
  rollup, or percentage over a bounded/truncatable served slice must be computed and served by
  the engine over the full set pre-truncation, never re-counted in the frontend over the
  capped slice. This sharpening has been applied and synced.
