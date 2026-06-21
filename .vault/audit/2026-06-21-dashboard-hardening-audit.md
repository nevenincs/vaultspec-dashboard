---
tags:
  - '#audit'
  - '#dashboard-hardening'
date: '2026-06-21'
modified: '2026-06-21'
related: []
---

# `dashboard-hardening` audit: `dashboard hardening audit: five-axis threat model`

## Scope

Cross-cutting hardening audit + threat model over the critical components (engine,
stores, scene) on FIVE axes: adversarial (untrusted input, resource exhaustion,
injection, trust boundaries, auth); mutation/destruction (filesystem/data blast
radius); degradation (no-GPU/headless, WebGL context-loss, memory, perf, backend
tier-down); memory-safety; performance. Triggered by a security + correctness
concern: the graph canvas must run in headless Chrome with no GPU, and the backend
modifies the filesystem and can mutate/destroy data. grep/code-grounded (semantic
search was unstable during the audit); three per-layer audits synthesized with
cross-cutting verification.

## Findings

**Axis 1 — Adversarial.** Engine: 0 HIGH, 0 exploitable. The three highest-leverage
vectors are impossible by construction — ReDoS (Rust `regex` is linear-time, no
backtracking, plus a compile `size_limit` and a 512-char pattern cap), write-seam
shell-injection (every subprocess is argv via direct-exec, never a shell), scope
path-traversal (scope tokens are membership-matched against enumerated worktree
roots, not path-resolved) — atop loopback-only bind, a global host-guard
(DNS-rebind), bearer auth, body limit, caps, whitelists, catch-panic, and
poison-recovery. The ONE real finding was CONFIG DRIFT: a bearer-auth allowlist had
drifted to exempt six data routes (one of them a PUT mutation) — not a primitive
weakness. Client: the wire-read adapters trusted the engine (no payload cap,
prototype-pollution, no hostile fixtures).

**Axis 2 — Mutation/destruction.** The engine brokers mutations (it forwards write
verbs to `vaultspec-core` and persists nothing of its own beyond re-derivable
engine-data). Brokered surface = four doc-edit verbs + `link` + `create` + `archive` + `autofix` + rag
controls + engine-data + dashboard-state PATCH. AUTHZ + VALIDATION strong; the worst
primitives — document-delete, bulk-delete, filesystem rm, whole-vault fix, git
mutation — are NOT exposed (git is whitelist-read-only, compile-time-asserted). The
concentrated gap is SAFETY + REVERSIBILITY on the destructive/bulk verbs: `archive`
is a feature-wide destruction with no dry-run preview (so the dashboard cannot
follow the project's own archive discipline) and no in-product undo route
(git-recoverable on disk only); `autofix` bulk-edits with no dry-run.

**Axis 3 — Degradation.** The primary gap was scene WebGL: the renderer was built
with no try/catch, no context-loss handlers, no power-preference → a GPU reset or a
no-GPU/headless environment silently blanked the graph. The steady-state memory/perf
within degradation (render-on-demand, settle-freeze, bounded queries) was already
covered.

**Axis 4 — Memory-safety.** Largely covered: no `unsafe` Rust; accumulators bounded
by default (channels, rings, SQLite caches, per-generation cells); poison-recovery
on every lock; GPU resources disposed on data-swap/destroy/rebuild (confirmed clean
across the context-loss rebuild cycle); render-on-demand idles the GPU. Gap: the
scene's data-ingestion built O(N) GPU buffers trusting the engine's node bound — a
SECOND client wire-ingestion point mirroring the stores-adapter gap.

**Axis 5 — Performance.** Largely covered: graph compute is CPU-bound; projections
memoize on the immutable graph generation; queries are bounded by default;
render-on-demand + settle-stop + semantic-zoom LOD + a label budget. Gap: no
FPS-adaptive throttle — a software-WebGL or weak-GPU client could crawl with no
quality back-off.

**Key insight — the trust boundary is ASYMMETRIC.** The engine (producer) is mature
by construction; the one real adversarial hole was config drift, not a primitive
weakness. The CLIENT (consumer) — the wire-read adapters and the scene
render/ingestion paths — was the under-hardened side, and is where the work
concentrated.

## Recommendations

- Adversarial: shipped — engine residual fixes (capability-probe timeout,
  range-query cap) + the structural anti-drift auth guard; client payload cap +
  prototype-pollution guard + hostile-fixture suite.
- Mutation/destruction: broker `archive --dry-run` (preview which docs move and which
  cross-feature links break) + add an `unarchive` route (undo) + broker
  `autofix --dry-run`; keep the destructive primitives unexposed.
- Degradation: shipped — the two-tier renderer (real-GPU → software-fallback →
  honest-unavailable) + context-loss recovery + the render-capability degraded state,
  headless-verified rendering the full graph.
- Memory: add a scene-side node ceiling at data-ingestion (defense-in-depth at the
  second client wire boundary).
- Performance: add FPS-adaptive LOD (throttle on measured frame-time: labels → node
  cap → instancing).

## Codification candidates

- **Source:** the scene WebGL degradation gap. **Rule slug:**
  `scene-survives-gpu-context-loss`. **Rule:** the scene must detect WebGL-unavailable
  and context-loss, recover on restore (rebuild GL, preserve the CPU layout), and
  report render-capability via the controller event channel — never silently blank;
  the app renders the designed degraded state per mode.
- **Source:** finding G2 + the scene node-ceiling. **Rule slug:**
  `client-defensively-bounds-the-wire-payload`. **Rule:** every client wire-ingestion
  point (stores adapters and scene data-ingestion) defensively bounds what it
  deserializes (cap + honest truncation) and never trusts the engine's server-side
  bound; untrusted wire keys use null-prototype maps or key-filtering.
- **Source:** the bearer-gate config-drift finding. **Rule slug:**
  `auth-gating-is-structural-fail-closed`. **Rule:** every engine data route is
  bearer-gated by default; auth is structural (fail-closed) with exemptions explicit
  AND guard-tested, never a drift-prone allowlist.
- **Source:** the no-mock test reality. **Reconcile (edit):**
  `mock-mirrors-live-wire-shape` — its mock premise is stale (the GUI tests against the
  live engine; adversarial shapes are covered by hostile fixtures); rewrite to the
  live-engine reality, intent preserved.
