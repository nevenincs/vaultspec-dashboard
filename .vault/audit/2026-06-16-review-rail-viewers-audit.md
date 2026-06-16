---
tags:
  - '#audit'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
  - "[[2026-06-16-review-rail-viewers-adr]]"
---



# `review-rail-viewers` audit: `review-rail-viewers code review`

## Scope

This is the mandatory code review (Phase P07.S36) over the delivered surfaces of
the `review-rail-viewers` execution: the bounded read-only engine content route
(P01), the stores content query layer (P02), the shared Shiki highlighter (P03),
the frontmatter-aware markdown reader (P04), and the read-only code viewer (P05),
plus the P07 gate verification. Phase P06 (right-rail Overview re-scope) was
superseded mid-execution by a revised right-rail decision and is OUT OF SCOPE of
this review; its steps and the P06-dependent P07.S35 verification are deferred to
the follow-up that builds the revised rail.

The audit checks each binding project rule named in the plan, the no-crash and
read-only safety posture, the test integrity (no doubles in the integration
seams, no tautologies, no skips), and the gate results.

## Findings

Verdict: PASS. No HIGH or MEDIUM findings. The implementation honors every binding
rule and both gates are green.

### Layer ownership and read-and-infer (PASS)

- The content route reads only: it resolves a node id to a repo-relative path,
  guards traversal before any disk touch, and reads bytes through
  `read_from_worktree` / `read_from_ref`. A search of the route for write,
  create-dir, remove, or open-for-write operations finds only test-fixture writes
  under `#[cfg(test)]` — the route logic writes nothing, mutates no ref, and grows
  no sibling semantics (`engine-read-and-infer`).
- The viewers and the viewer-surface host fetch nothing: a search of the viewer
  directory for a fetch call, an `engineClient` reference, or a raw `.tiers` read
  finds none. The stores content query is the sole wire client of the route, and
  the viewers consume only the tiers-derived `ContentView` selector
  (`dashboard-layer-ownership`, `views-are-projections-of-one-model`).

### Tiers block and the shared envelope (PASS)

- The route returns through the shared `envelope(...)` helper on success and
  through `api_error` / a `degraded_tiers_for` body on error — no hand-built
  response body, so the tiers block rides every response
  (`every-wire-response-carries-the-tiers-block`). Engine tests assert the tiers
  block on the success, traversal-400, unknown-404, non-content-400, and
  structural-degradation paths.
- The stores content selector derives degraded/offline state from the served
  tiers block (the structural tier the read resolves through), reading the fresh
  error envelope's tiers over a stale held-success block, and distinguishes a
  tiers-less transport fault (errored) from a tiers-bearing degradation — never
  guessing "down" from a bare transport error
  (`degradation-is-read-from-tiers-not-guessed-from-errors`).

### Bounded by default (PASS)

- The route is byte-capped by `MAX_CONTENT_BYTES` with an honest `truncated`
  block, truncating at a UTF-8 char boundary; `/vault-tree` and `/file-tree` stay
  byte-free (content lives only on the new route) — `graph-queries-are-bounded-by-
  default`, generalized.
- The stores content query carries an explicit `gcTime` so a closed viewer's
  (up-to-cap) bytes are evicted promptly rather than retained for the session, and
  the per-observer single-entry shape bounds concurrent cache pressure
  (`bounded-by-default-for-every-accumulator`).

### Mock fidelity (PASS)

- The mock engine serves the exact live `/nodes/{id}/content` field set
  flat-with-tiers, with the same extension-to-language-hint mapping and the same
  id-resolution and error splits; a fidelity test feeds a captured mock sample
  through the real `adaptContent` adapter and asserts the field set, the doc/code
  resolution, the structural degradation, and the 404/400 splits
  (`mock-mirrors-live-wire-shape`).

### Theming and warmth (PASS)

- The highlighter binds every Shiki token foreground to a `var(--color-*)`
  reference to the existing semantic token tier — one theme object, three token
  maps for light/dark/high-contrast, no per-surface color
  (`themes-are-oklch-generated-from-a-token-tier`). The DOM resolves the var chain
  natively (the scene-seam getComputedStyle caveat does not apply to DOM chrome).
- No new syntax-color accent, gradient, or texture: token bindings map onto the
  warm low-chroma neutral ramp plus the single accent and the established
  state/tier hues (`warmth-lives-in-tokens-not-decoration`). The viewer/rail chrome
  marks come from Lucide (`X` close icon) only
  (`icons-come-from-the-two-sanctioned-families`).

### Published wheel purity (PASS)

- shiki, the langs/themes packages, react-markdown, and remark-gfm land in the
  frontend's runtime `dependencies`; neither vaultspec-rag nor torch is present
  (`published-wheel-purity`). These are JS deps, not the Python wheel, but the
  spirit — viewer libs in runtime, no rag/torch — holds.

### Gates and test integrity (PASS)

- The full frontend gate (`just dev lint frontend`) exits 0: eslint, prettier
  `format:check`, tsc, token-drift, and figma-registry all green
  (`declaring-green-runs-the-full-gate`). The engine gate (`cargo fmt --check` +
  `cargo clippy --all-targets`) exits 0.
- Tests exercise real code paths: the engine route tests run the real router and
  read real temp-dir files; the mock-fidelity test runs the real adapter; the
  highlighter tests run the real Shiki engine; the viewer tests render real DOM.
  No test doubles at the integration boundaries, no tautological assertions, no
  skips introduced. Expected values are derived from the specification (the wire
  field set, the byte cap, the language mapping), not copied from output.

## Recommendations

- Implement the revised right-rail "Status overview" (the superseded P06) as the
  named follow-up; the open-in-viewer intent its cross-links will drive is already
  built and tested, so the rail work is wiring, not new viewer infrastructure.
- When the boundary has held across one full cycle, consider promoting the ADR's
  two codification candidates (below); per the codify discipline, the first
  encounter is not yet a rule.

## Codification candidates


The ADR named two candidates; this audit confirms the boundary held on its first
encounter but does NOT promote them yet, per the codify discipline (a lesson
qualifies only after holding across at least one full execution cycle).

- **Source:** the content-route boundary (P01/P02), the ADR's first candidate.
  **Rule slug:** `content-fetch-is-the-one-viewer-backend`.
  **Rule:** Document and code file bytes reach the GUI through exactly one
  bounded, read-only, enveloped engine content route consumed solely by the stores
  layer; listing routes stay byte-free, and no app or scene surface fetches or
  inlines file content. Defer promotion until the boundary holds across a second
  cycle.

- **Source:** the shared highlighter (P03), the ADR's second candidate.
  **Rule slug:** `one-highlighter-themed-from-the-token-tier`.
  **Rule:** All syntax highlighting goes through one shared highlighter whose token
  colors bind to the OKLCH semantic token tier, so a theme is a token map, never a
  per-surface or per-language stylesheet. Defer promotion until a second cycle.
