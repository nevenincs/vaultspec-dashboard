# Production and dev are fenced domains, one-way

- **`frontend/src` ships; `frontend/dev` never does.** All development scaffolding — the
  visual review desk (`dev/visual-review/`), the per-surface labs (`dev/labs/`), spikes
  and throwaway probes — lives under `frontend/dev/`, served only by
  `vite.dev.config.ts` (port `DEV_PORTS.visualReview`). The production build input stays
  exactly `index.html`, so no dev module can reach a shipped bundle even by accident.
  Config separation mirrors code separation: `vite.config.ts` is strictly production.
- **Imports are one-way.** `dev/**` MAY import `src/**` — a harness that renders anything
  other than the real production component is worthless, and it reaches production code
  through the one `@app/*` alias. `src/**` importing `dev/**` is a build failure. No
  exceptions: a production module that needs something from `dev/` means the thing is not
  actually dev-only and belongs in `src/`.
- **A production component never carries an affordance that exists only to serve a
  harness.** No `stateOverride`, `modeOverride`, `forceState`, `previewState`, or
  `__harness*` prop; no dev-only branch in a shipped render path. A data-bearing surface
  splits into a CONTAINER that derives its state from stores and the `tiers` block, and a
  wire-free VIEW that receives the resolved state as a normal required prop. The harness
  renders the view. Nothing needs to override anything — the seam is the prop the view
  already takes.
- **Modes are rendered, never simulated.** A harness reaches `typical`/`loading`/
  `degraded`/`empty` by rendering the shared mode primitives (`Skeleton`, `StateBlock`,
  the rail state components) with props. NEVER by seeding, stubbing, or faking the engine
  wire. This is not style: the previous component gallery was REMOVED because it kept a
  seeded engine wire "outside Vitest and outside backend confidence"
  (`2026-06-17-management-engine-optimization-audit` finding `final-execution-005`), and
  the wire-contract rule forbids faking the wire. A design needing an authored engine
  double repeats a mistake this project already paid for. Where a whole composed surface
  must be reviewed end-to-end, serve it from the REAL engine over the committed fixture
  vault (`frontend/src/testing/fixtures/`), never a double.
  - SANCTIONED EXCEPTION (owner decision, `2026-07-31-visual-review-authored-states-adr`):
    the visual review desk (`frontend/dev/visual-review/`) renders real production
    components from AUTHORED per-component inputs — typed view-model props, and per-cell
    query caches seeded at the real `engineKeys` — on a hermetically network-inert page.
    A desk cell proves what a state LOOKS like, never that the application reaches it;
    reachability proof stays with the live-wire test suites. No production component
    gains a harness affordance, nothing under `src/` or any test may consume the
    authored inputs, and no second surface may cite this exception without its own
    reviewed decision.
- **Why the fence is mechanical rather than conventional:** the boundary previously failed
  in four places at once — a dev-only prop on a shipped component, a dev module inside the
  production stores layer, dev copy compiled into the shipped localization catalog, and
  five harnesses under `src/`. Each passed review individually. Convention did not hold;
  the gate does. Keeping dev prose out of `src/` is also what keeps `lint:localization` and
  `lint:px` meaningful — both sit at zero findings.
- Guard: `frontend/dev/tooling/scan-domains.mjs` (`npm run lint:domains`, in
  `just lint frontend`). It carries a RATCHET of known-pending violations, each naming
  the step that retires it; entries may only be removed, never added.
