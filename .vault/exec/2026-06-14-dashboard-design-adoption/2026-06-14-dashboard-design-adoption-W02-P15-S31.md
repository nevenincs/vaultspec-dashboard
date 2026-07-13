---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S31'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Re-skin the rag manager onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green

## Scope

- `frontend/src/app`

## Description

Re-skinned the rag server manager onto the OKLCH token layer and the sanctioned
Lucide chrome marks per the accepted rag-manager surface ADR, a re-skin plus
gap-fill of existing components with no wire-contract or layer-boundary change.

Per-ADR React element inventory (every element the ADR names, mapped to existing
JSX or NEW):

- Rag service status indicator — EXISTING `ragCard` in `NowStrip.tsx`, REWORKED
  into a pure `ragCardView` projection over the interpreted rag view, with a
  leading Lucide `Eye` identity mark and a trailing per-tone Lucide state mark
  (`ShieldCheck`/`AlertTriangle`/`CircleSlash`); meaning carried by mark + text
  first, token ink as redundant reinforcement (grayscale-safe).
- Composite readiness ("ready" only when running + index + watcher) — NEW: stated
  plainly in the rollup detail rather than left for the operator to infer.
- Index-present + watcher state — EXISTING fields, now surfaced through the
  readiness detail line; in-flight job count — EXISTING, now rendered as a
  tabular-numeral receipt chip (`data-tabular`).
- Start / stop / reindex / watcher-tuning controls — EXISTING `OPS_WHITELIST`
  rows, REWORKED: each carries a conventional Lucide chrome mark (`Play` / `Square`
  / `RefreshCw` / `Settings2`), kept verbatim R1 (never grown GUI-side).
- Contextual cluster — NEW: start rag offered only when rag is stopped/absent;
  stop/reindex/watcher-tuning only when running, derived from the stores rag view.
- Arm-then-confirm per op — EXISTING `useConfirmable` two-step, REWORKED skin: the
  armed affordance is an accented `bg-accent-subtle`/`border-accent` confirm with
  auto-focus and an explicit cancel (Escape disarms).
- In-progress / liveness — NEW: the firing op swaps its mark for a pulsing
  `Loader2` tied to the real pending mutation, `aria-busy` set; suppressed under
  the app-wide reduced-motion floor.
- Ready / loading / rag-stopped / rag-absent / degraded(tiers) / error states —
  realized as designed states in both the rollup and the cluster.
- Result receipt — EXISTING `lastResult` line, REWORKED into a toned receipt that
  distinguishes a rag-down 502 (tier truth: "rag is down — start it first") from a
  generic failure, read off `EngineError.tiers`.
- Disabled-in-time-travel — EXISTING, REWORKED into an explained `role=status`
  notice with a Lucide mark.
- Keyboard + a11y — polite `role=status` live regions in both components, ARIA
  labels on confirm/cancel and marks, visible focus rings, non-color-only status.
- Dispatch path `opsActions.ts` — UNCHANGED (ADR: behavior unchanged); every op
  still flows `dispatchOps` → `appDispatcher` → engine `/ops/{target}/{verb}`.

Implementation:

- Added a `useRagStatus` stores selector plus `deriveRagStatusView` in
  `queries.ts` (stores layer, mirroring `useGitStatus`): interprets `service` /
  `watcher` / `index` / `jobs`, the composite `ready`, and the `semantic`-tier
  `degraded` truth, so chrome reads interpreted state and never the raw `status.rag`
  or the raw `tiers` block.
- Reworked `NowStrip.tsx`: rag card consumes `useRagStatus`; git/core stay pure
  rollups; cards moved to `rounded-vs-md`, subtle elevation, soft low-contrast
  borders, Lucide marks, tabular job chip, and a polite live region for the
  rag-became-stopped/running transition.
- Reworked `OpsPanel.tsx`: Lucide-marked contextual cluster, per-op liveness cue,
  toned legible receipt surfacing tier truth, explained time-travel notice, full
  keyboard/a11y; `OPS_WHITELIST` kept verbatim R1.
- Tests: extended `OpsPanel.test.tsx` (contextual cluster narrowing, cancel
  disarm, rag-down 502 → tier-truth receipt, success receipt), `NowStrip.test.tsx`
  (readiness receipt, degraded-tier warn state through the real component + mock),
  and `rail.test.ts` (rag rollup driven end-to-end through `deriveRagStatusView` —
  stopped/absent/ready/degraded). Degraded/in-progress/ready/error states, the
  dispatch path, and the arm-to-confirm keyboard flow are all covered against the
  live-shape mock; no test doubles mask the dispatch boundary.

## Outcome

Full lint gate `just dev lint frontend` (eslint + prettier + tsc) exits 0. Full
frontend suite: 700 passed, 9 skipped (the 9 skips are the pre-existing
live-engine conformance suite gated on a running engine at port 3000 — none are
mine; my three test files carry zero skips). The eight right-rail test files pass
(78 tests). The surface now reads native to the agentic-desktop cohort: legible
readiness, conventional Lucide marks, deliberate arm-then-confirm, honest degraded
states, theme-correct across dark/light/high-contrast via the shared token layer.
The read-and-infer boundary and the single-seam discipline are preserved.

## Notes

No `styles.css`, `scene/`, `app/stage/`, `app/timeline/`, or sibling-surface
files were touched; only `app/right/OpsPanel.tsx`, `app/right/NowStrip.tsx`, their
tests, `app/right/rail.test.ts`, and `stores/server/queries.ts` (the sanctioned
rag-status selector). `opsActions.ts` was left unchanged per the ADR.

No rag-manager ADR insufficiency surfaced: the ADR scoped exactly three pieces and
named every state, and the `/status` snapshot carries every field the composite
readiness needs. One judgment call worth recording for review: the ADR speaks of a
single rag rollup card but the surface composes a strip of three rollups
(git/core/rag); I kept that composition and applied the rag-manager skin to the rag
card while bringing git/core onto the same card grammar for consistency — within
the re-skin scope, not a new surface.
