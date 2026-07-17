---
tags:
  - '#adr'
  - '#dashboard-hardening'
date: '2026-06-21'
modified: '2026-07-17'
related:
  - "[[2026-06-21-dashboard-hardening-audit]]"
  - "[[2026-06-15-resource-hardening-research]]"
---

# `dashboard-hardening` adr: `dashboard hardening: adversarial and degraded resilience` | (**status:** `accepted`)

## Problem Statement

The dashboard must be robust in ADVERSARIAL environments (untrusted input, resource
exhaustion, injection, trust boundaries, auth) and DEGRADED contexts (no-GPU/headless,
WebGL context-loss, memory pressure, performance limits, backend tier-down), and its
Rust backend modifies the filesystem and can mutate/destroy data. A five-axis threat
model + per-layer audits were run. The central finding: the trust boundary is
ASYMMETRIC — the engine (producer) is mature by construction, while the CLIENT
(consumer) was the under-hardened side. This ADR records the decisions that close the
gaps.

## Considerations

Five axes — adversarial, mutation/destruction, degradation, memory-safety,
performance. The engine's defenses are strong by construction (linear regex,
argv-not-shell, membership-matched scope tokens, loopback bind, global middleware,
caps, whitelists); the one real adversarial finding was config drift, not a primitive
weakness. The client's wire-read adapters and the scene's render/ingestion paths were
the gaps. The graph canvas must run in headless Chrome with no GPU (a hard mandate).
The GPU is client-side — the engine cannot detect it — so render-capability is
client-originated.

## Constraints

- The engine is read-and-infer: it never writes vault docs directly; it BROKERS
  mutations by forwarding whitelisted verbs to `vaultspec-core`. D5 fences what those
  FORWARDED writes can do — it does not relax the read-and-infer fence.
- The headless/no-GPU mandate forbids rejecting software-WebGL: the renderer must
  render via software in headless, not show unavailable.
- The GUI tests against the live engine (no pervasive mock) — adversarial shapes are
  covered by hostile fixtures, not a mock double.
- Cross-campaign shared-tree concurrency: fixes land in clean windows where files are
  contended by other campaigns.

## Implementation

**D1 — Render-capability degradation contract (two-tier ctor).** The scene emits a
render-capability event (`ok`/`context-lost`/`unavailable`, with recoverable + reason)
on init, context-loss, and restore. The renderer ctor is TWO-TIER: tier-1
high-performance + fail-if-major-caveat → real GPU → `ok`; tier-2 retry without the
flag → software renders → `ok`+`software-fallback`; tier-3 no-GL → `unavailable`.
Context-loss preventDefaults + pauses; restore rebuilds GL from the persisted CPU
layout. Stores hold a local `renderCapability`; the canvas-state resolver gains a
render-unavailable state (precedence after awaiting-scope, before data states); the
app renders plain copy. Scene detects/recovers, app renders.

**D2 — Wire-read adapters defensively validate, not trust.** Every client
wire-ingestion point (the stores adapters AND the scene's data-ingestion) caps what it
deserializes + emits honest truncation, never trusting the engine's server-side bound;
untrusted wire keys use null-prototype maps / key-filtering; a hostile-fixture suite
proves it.

**D3 — Auth gating is structural / fail-closed.** Every engine data route is
bearer-gated by default; exemptions are explicit AND guard-tested (a structural test
asserts every route requires the bearer) — never a drift-prone allowlist.

**D4 — The adversarial axis is mature by construction.** ReDoS impossible, write-seam
argv-not-shell, scope membership-matched; only small residual fixes were needed
(capability-probe timeout, range-query cap, the bearer-drift closure).

**D5 — Every mutation/destruction path is authorized, blast-radius-bounded, and
reversible/safe.** The brokered surface (doc-edit verbs + link + create + archive +
autofix + rag + engine-data + dashboard-state) is authenticated + validated; the
destructive/bulk verbs (archive, autofix) gain a dry-run preview + an unarchive route
(reversibility); the worst primitives (document-delete, bulk-delete, git mutation)
stay unexposed.

## Rationale

The asymmetric-trust finding focuses the work on the client. Render-capability is
client-originated because the GPU is the browser's. The two-tier ctor reconciles "fail
honestly" with "must run headless/no-GPU." Structural auth replaces per-route
vigilance (the drift had exposed a bearer-less mutation route). D5 fences the brokered
write surface the read-and-infer rule allows via forwarding. Memory + performance
largely hold (no `unsafe`, bounded accumulators, CPU-compute, memoize-on-generation);
the two new gaps (scene node-ceiling, FPS-adaptive LOD) are extensions of established
patterns (the wire-trust bound and semantic-zoom LOD).

## Consequences

The graph survives GPU loss + degrades honestly (and renders in headless
software-WebGL); the client stops trusting the wire blindly at both ingestion points;
auth is structural not vigilant; the mutation surface is bounded + reversible. A
3-concept tier taxonomy is clarified: EDGE tiers (the graph), degradation/search tiers
(incl. semantic — NOT the graph), and render-capability (client GPU). The binding
Figma is synced. Pitfall guarded: a small Figma mockup can hide what reads wrong at
real scale, so visual changes get a live show-first review.

## Codification candidates

- **Rule slug:** `scene-survives-gpu-context-loss`. **Rule:** the scene detects
  WebGL-unavailable + context-loss, recovers on restore (rebuild GL, preserve the CPU
  layout), reports render-capability via the controller event channel, and never
  silently blanks; the app renders the designed degraded state per mode.
- **Rule slug:** `client-defensively-bounds-the-wire-payload`. **Rule:** every client
  wire-ingestion point bounds what it deserializes (cap + honest truncation) and never
  trusts the engine's server-side bound; untrusted wire keys use null-prototype maps /
  key-filtering.
- **Rule slug:** `auth-gating-is-structural-fail-closed`. **Rule:** every engine data
  route is bearer-gated by default; exemptions explicit AND guard-tested, never a
  drift-prone allowlist.
- **Reconcile:** `mock-mirrors-live-wire-shape` — its mock premise is stale (the GUI
  tests against the live engine; adversarial shapes covered by hostile fixtures);
  rewrite to the live-engine reality, intent preserved.
