---
tags:
  - '#adr'
  - '#global-state-review'
date: '2026-07-03'
modified: '2026-07-17'
related:
  - "[[2026-07-03-global-state-review-audit]]"
  - "[[2026-07-02-global-state-review-audit]]"
  - "[[2026-06-25-state-mode-uniformity-research]]"
---

# `global-state-review` adr: `dashboard-state field lifetimes: durable preference vs session intent` | (**status:** `accepted`)

## Problem Statement

Every field in backend dashboard-state currently persists indefinitely, but the fields
have different natural lifetimes. The cross-surface state review (GSR-002) surfaced the
consequence: a selection made days earlier silently re-drives the follow-mode rail
reveal, the graph cluster spotlight, and the camera on a fresh load — the system
working as designed while violating the user's mental model of "a fresh session".
The server-managed intent architecture itself was assessed and reaffirmed as sound
(one authority, every surface a subscriber — the lock-step agreement the live campaign
verified); the gap is purely SEMANTIC: the state model has no notion of which fields
are durable preferences and which are session intent. This ADR classifies the fields
and decides the expiry mechanism for the session-intent class. Grounded in the two
global-state-review audits (the pipeline's research grounding for this decision — the
audits are the empirical record).

## Considerations

- One precedent already exists and is codified: a persisted `timeline_mode` of
  time-travel is healed to live once per scope on boot (TTR-005,
  `useHealTimelineModeToLiveOnBoot`, mounted once by the Stage) — session-intent
  expiry, implemented client-side as a one-shot boot heal over the ordinary mutation
  seam. The decision here generalizes that shape rather than inventing a second one.
- Mid-session reloads are constant (dev HMR, browser restarts) and losing the working
  selection on every reload would be a real regression — expiry must distinguish "the
  same working session" from "a genuine absence", which an unconditional clear cannot.
- Dashboard-state carries no per-field timestamps, so a pure client policy needs its
  own recency signal. The established view-local persistence discipline (guarded
  localStorage, bounded, corrupt-blob-safe — the scopedStore / positionCache /
  browser-tree patterns) provides it cheaply.
- Node positions taught the precedent that view-local presentation state may persist
  client-side; an ACTIVITY STAMP is even further from displayed state, so no
  backend-serving rule is implicated.
- The expiry window is a behavioural constant, not a user preference — shipping it as
  a setting would violate the no-dead-settings rule (nothing would sensibly tune it).

## Considered options

- **Status quo — selection persists forever.** Rejected: the GSR-002 evidence is
  exactly the mental-model violation this class of state produces; it will recur on
  every stale scope re-entry.
- **Server-side per-field TTL (engine expires stale intent on read).** Rejected for
  now: an engine + wire change for a presentation-semantics problem, and the engine
  would need to define "activity" it cannot observe (a client being open is client
  knowledge). Recorded as the stronger successor IF multi-client concurrency ever
  demands authoritative lifetimes.
- **Unconditional boot clear (the raw timeline-heal shape).** Rejected: correct for
  time-travel mode (a modal view with no exit), wrong for selection — it destroys the
  legitimate resumption value inside a working session.
- **Staleness-gated client boot heal (CHOSEN).** A view-local per-scope activity stamp
  gates a one-shot boot heal: a boot within the freshness window resumes the
  selection; a boot after a genuine absence clears it through the ordinary selection
  mutation seam. Client-only, no wire change, mirrors the codified precedent.

## Constraints

- The heal writes through the ONE canonical selection seam (`selectionPatch` over the
  dashboard-state mutation) — never a bespoke wire write; the projection then clears
  the ring/spotlight/reveal everywhere by construction.
- One-shot per scope per app lifetime (healed-set ref), idempotent with the session
  seed and its own write settling — the exact `useHealTimelineModeToLiveOnBoot`
  discipline, mounted by the same single owner (the Stage).
- The activity stamp is bounded (per-scope map under one storage key, entry cap with
  oldest-first eviction), guarded against storage failure, and never read by any
  display surface — it gates the heal and nothing else.
- Classification of the remaining fields is EXPLICIT and unchanged in behaviour:
  durable preferences (filters, date range, graph granularity, corpus, panel
  affordances, lens) persist indefinitely; `timeline_mode` keeps its existing
  stricter unconditional heal (TTR-005); view-local chrome (hover, tree disclosure,
  working set, roving focus, sim run mirror) stays client-side.
- The freshness window is one named constant in the heal seam (8 hours — a mid-day
  reload resumes, a next-morning boot starts clean), deliberately NOT a registry
  setting.

## Implementation

A view-local freshness seam (`stores/view` — guarded localStorage, one key, bounded
per-scope map) exposes: a pure staleness derivation, a read of the scope's last
activity stamp, and a stamp write. A server-layer boot-heal hook (sibling of the
timeline heal in the stores queries module) runs once per scope when the dashboard
state has loaded: if a canonical selection exists AND the scope's stamp is absent or
older than the window, it clears the selection through `selectionPatch`; in every case
it then stamps the scope. While mounted it re-stamps whenever the canonical selected
node changes, so an open, actively-used tab keeps its scope fresh and a reload after
active use resumes. The Stage mounts the hook beside the timeline heal. The rail,
graph spotlight, camera, and inspector all follow the cleared selection through the
existing projection — no surface-specific work.

## Rationale

The lifetimes gap is real (lived, twice — GS-004's ghost-emphasis edge and GSR-002's
rail variance both trace to eternal session intent), but the architecture is right, so
the fix must be the smallest semantics patch that preserves it: same authority, same
mutation seam, same one-shot heal discipline the project already codified for
timeline mode. The staleness gate is what makes selection's heal correct where an
unconditional clear would not be — selection has resumption value inside a session and
none after a genuine absence. Client-side is the honest home for the recency signal
because activity is client knowledge; the moment lifetimes need to be authoritative
across clients, the recorded server-TTL successor takes over.

## Consequences

Gains: a stale selection can no longer steer a fresh load (no surprise reveal,
spotlight, or camera frame from a days-old click); the field classification is now
written down, so future dashboard-state additions must pick a lifetime class
deliberately; the heal composes with everything downstream for free via the canonical
seam.

Costs and edges: a genuinely-wanted week-old selection is lost on boot (the user
re-selects — one click); a second client with a fresh browser profile boots stale and
clears a sibling live client's selection (rare, consistent with the standing
last-writer-wins model, recorded here); clearing browser storage makes the next boot
heal (safe default — a clean start); the 8-hour constant is a judgement call, revisit
against lived feel rather than pre-tuning.

Opens: the durable-vs-session classification is the natural place to hang future
lifetime policies (e.g. if working-set ever moves canonical), and the server-TTL
successor is pre-decided if multi-client sharing arrives.
