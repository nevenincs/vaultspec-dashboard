---
tags:
  - '#audit'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-06-13'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
  - "[[2026-06-13-dashboard-platform-adr]]"
---

# `dashboard-platform` audit: `frontend runtime substrate`

## Scope

Formal Phase 5 review of the new `frontend/src/platform/` runtime substrate (the five
commits delivering the observability spine, exception containment, the dispatch seam,
and the failure policy), plus its integration edits to the app root, the shell, the
query client, and the three scene-worker logging migrations. Conducted by the
`vaultspec-code-reviewer` persona against ADR decisions D1-D5, the project rules
(`dashboard-layer-ownership`, `engine-read-and-infer`, `published-wheel-purity`,
`review-revision-precedence`), and the project's test/lint/type integrity mandates.

## Findings

**Verdict: PASS. No HIGH findings.** All gates re-verified green by the reviewer:
typecheck, lint, 300 unit tests, production build, the five live adverse-condition e2e
tests in Chromium, and `vault check all` (warnings only, all pre-existing and
unrelated to this feature).

Mandate verification, all passing:

- **ADR D1 (no upward imports):** a grep of the substrate for `../app`, `../scene`,
  `../stores` returns zero; `EngineError`/`EngineStatus`/`matrixFor` appear only in
  comments and test names, never as imports. The policy reads the engine HTTP error
  structurally (a numeric `status` duck-typed off `unknown`), never importing
  `EngineError`.
- **ADR D4 (mechanism/vocabulary split):** the policy owns classification only; the
  degraded-to-surface binding is injected and null until the app wires it.
- **Locked scene seam:** `scene/sceneController.ts` was not touched; the three permitted
  downward worker-bridge edits are correct and minimal, and the worker bridge is
  runtime-logger-free (verified against the built worker artifact: it carries the bridge
  tag but no logger/sink/ring-buffer classes).
- **Containment, dispatch, logger, test integrity:** region isolation is real (unit +
  live e2e); the arm-to-confirm guard has no local/shared-state desync; the only
  sanctioned `console.*` is the `ConsoleSink`; no tautological tests, no
  quality-masking mocks, no lint/type suppressions in new code; the e2e is genuinely
  live (real browser, real injected render throw).

Findings raised and their resolution in the revision commit:

- **MEDIUM-1 (resolved):** the plan's live-verification claim overstated the e2e -
  it claimed live coverage of failed-query, dropped-stream, and global-trap paths, but
  the e2e exercised only boundary containment. Resolved by (a) adding a fifth live e2e
  case that fires a real unhandled rejection and asserts the global trap captured it
  into the dev-exposed ring buffer, and (b) scoping the plan's Verification bullet
  honestly: the live pass covers containment, recovery, and the global trap; the
  failed-query/dropped-stream classification is unit-covered and the degraded-surface
  rendering is the `app/degradation` layer's, tested against contract section 8.
- **LOW-1 (acknowledged, no change):** `installGlobalTraps` returns a no-op handle on an
  idempotent second install; harmless in the single-root app (one install, never
  uninstalled). Documented behavior, no runtime impact.
- **LOW-2 (resolved):** added a unit test asserting `CrashInjector` renders nothing when
  `import.meta.env.DEV` is false, locking the production-safety invariant.
- **NIT-1 (resolved):** the ADR D2 prose middleware order was corrected to
  `trace -> log -> guard` to match the (more correct) implementation, where trace stamps
  the correlation id before the log line is written.
- **NIT-2 (resolved):** hoisted the per-edge child-logger construction out of the
  rejected-edge loop in field assembly.

## Recommendations

- The dispatch seam and the `setDegradationHandler` injection point are published but
  unwired in this cycle by design (opt-in adoption, ADR D2/D4). The natural next step is
  the Data and Chrome teams adopting them: the chrome team can drop its hand-rolled
  ops-confirm state in favor of `useConfirmable`, and the `app/degradation` layer should
  bind `setDegradationHandler` to flip the matrix on a `degraded` classification.
- A future hardening worth tracking: a CI assertion that the built worker bundle stays
  free of the root logger (the property verified manually here), and a dev log overlay
  reading the ring buffer (the exposure hook now exists).

## Codification candidates

The ADR proposed four candidate rules. Per the `vaultspec-codify` discipline, none is
promoted on first encounter - a lesson qualifies only after it has held across at least
one full execution cycle, and this is that first cycle. They are recorded here as
candidates to revisit when the substrate is exercised by a second feature (the feature
teams adopting the seams):

- **Source:** the D1 no-upward-import verification.
  **Rule slug:** `platform-owns-mechanism-not-vocabulary`.
  **Rule:** The `src/platform/` substrate classifies and contains failures but never
  owns which degraded surface state a failure maps to; the degradation vocabulary stays
  in `app/degradation`, invoked through an injected mapper, so the substrate never
  imports upward.

- **Source:** the dispatch-seam design.
  **Rule slug:** `ui-intents-flow-through-dispatch`.
  **Rule:** A user intent that needs logging, guarding, tracing, or audit is dispatched
  through the platform action seam rather than mutating a store directly.

- **Source:** the logger migration (the two scene `console.*` calls).
  **Rule slug:** `no-raw-console-use-the-platform-logger`.
  **Rule:** Frontend code logs through the platform logger, never `console.*` directly,
  so every log reaches the shared ring buffer and the dev overlay.

- **Source:** the D5 boundary mount map.
  **Rule slug:** `every-render-region-has-a-boundary`.
  **Rule:** Each independently-degradable UI region mounts inside a platform region
  boundary so a thrown render is contained to its region and never white-screens a
  sibling.

These are deferred, not promoted: the codify phase for them belongs to the cycle that
proves they bind a second team's work.
