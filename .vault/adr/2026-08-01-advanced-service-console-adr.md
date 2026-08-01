---
tags:
  - '#adr'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:64a79dd5407bcd81816fe58c7ca42fc5e3fe3f151e6d6db930ca626f5f9499c5'
related:
  - "[[2026-08-01-advanced-service-console-research]]"
---
# `advanced-service-console` adr: `one advanced console, no service chrome in the user ux` | (**status:** `accepted`)

## Problem Statement

Dev and service surfaces leak into the user chrome: framework status chips sit in the right-rail footer, a rag "Search" dashboard and an A2A lifecycle panel open as modal control panels, and the rag service controls read as product features. The owner rules all of it dev-territory and names Settings ▸ Advanced as the one canonical home. The rag console is simultaneously under-designed relative to the rag TUI it should pair with.

## Considerations

- The chips are today's only entry to the rag and a2a panels; removal and rehoming must be one cutover (research: mounting findings; no-deprecation-bridges discipline).
- The settings dialog is schema-driven for VALUES; consoles are not settings — the Advanced section must be a designed, deliberate non-schema extension, not hand-wired settings (research: settings dialog findings).
- Everything the redesigned rag console shows must come from rag's codified HTTP contract and the discovery record — never its Qdrant shape (rag-integration rule); identity facts (version, path, port, host, pid) are all already served (research: rag contract findings).
- The approvals count on the Review chip feeds the agent workflow and is NOT dev status; the agent-panel campaign owns that UX's future (owner's own deferral notes).

## Considered options

1. Settings ▸ Advanced hosts one consolidated service console; all service chrome leaves the user UX in the same change. CHOSEN.
2. Dedicated dev window outside Settings. Rejected — owner named the home explicitly.
3. Remove now, console later. Rejected — orphans controls; bridge-shaped.

## Constraints

- D1 — One home: the settings dialog gains an Advanced section (rendered after the schema-driven groups) hosting the service console. No service/dev surface may mount anywhere else in the product chrome; the desk and labs remain dev-domain.
- D2 — The user chrome sheds service surfaces in the SAME change: `FrameworkStatusCluster` leaves the rail footer; the rag dashboard and A2A lifecycle panels leave `ControlPanels`; their command-palette entries re-point to the Advanced console. No orphaned affordance, no legacy alias.
- D3 — Approvals stay user-facing, minimally: the pending-approvals affordance (count + open-review intent) survives as a small rail element with no dev styling; its final form belongs to the in-flight agent-panel campaign and is explicitly out of this record's scope.
- D4 — The rag console is the TUI's UI pair, named for the SERVICE (never "Search"): one panel with service identity header (name, version, host:port, pid, storage path — all from the codified contract/discovery record), lifecycle controls sized as normal actions (not a row of large buttons), job monitoring with the existing bounded filters, log tail, and storage/projects summary. All reads stay Tier-1 contract routes (+ the existing capability-gated Tier-2 Qdrant reads); no new naming-scheme couplings.
- D5 — A2A lifecycle relocates as a dev console subsection under Advanced, served by the existing `/a2a/lifecycle/*` plane unchanged; if the agent-panel campaign later supersedes it, it retires from ONE place.
- D6 — Engine status (the former Project-health chip's truth) renders as a compact status block inside Advanced from the existing status/tiers reads; degradation surfacing in the user chrome remains whatever the degradation matrix already renders on affected surfaces — this record moves the DASHBOARD of statuses, not the honest per-surface degradation.
- D7 — Access path: Settings opens from existing chrome; the Advanced section is one click inside (plus a palette command "Open service console"). No new keybinding by default (chord vetting applies if one is ever added).

## Implementation

Frontend-only rearrangement over existing wire: extend the settings dialog with the Advanced section frame; move (and redesign per D4) the rag console; move the A2A panel; add the engine-status block; remove the cluster and its ControlPanels plumbing; keep a minimal approvals affordance; re-point palette commands; update guards (actionCoverage, ControlPanels guard, filterConsolidation untouched) and the desk specimens for the moved surfaces. No engine changes; the settings schema is not widened by this record.

## Rationale

Every note names the same destination, and the blocking risk of naive removal (orphaned rag/a2a controls) dissolves when removal and rehoming are one change. Keeping approvals out of the purge respects the owner's own agent-campaign deferral while still deleting every dev-status pixel from the user chrome.

## Consequences

- The user chrome finally contains only user surfaces; every operational console lives behind Settings ▸ Advanced.
- The settings dialog carries a designed non-schema section — a deliberate, recorded extension of its schema-driven purity.
- The rag console becomes the service's honest face (identity, lifecycle, jobs, logs, storage) and drops the misleading "Search" name.
- Chip-based at-a-glance health disappears from the rail; anyone relying on it now opens Advanced (one click deeper) — accepted by the owner's ruling.
- The desk's FrameworkStatusCluster / RagJobDashboard / A2aLifecyclePanel specimens follow the surfaces into their new home.
