---
tags:
  - '#research'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:73209042e8460a3aced032cf49747e0a322ed7a87655e1c4acb81b4bcb3c8f18'
related: []
---

# `advanced-service-console` research: `settings advanced as the one home for service surfaces`

## Question

Four owner review notes converge on one displacement: the framework status chips are "a DEV status bleeding into the user ux. Remove it. Migrating to settings under Advanced as the canonical home for all things dev and settings related"; the rag job dashboard and its footer are "a redesign ask — the latest rag provides a full tui implementation and I need this rag monitor to be the nicely designed ui pair of the rag interface. Log, search and job monitoring, as well as status of the server, advanced filters etc must all live in this one canonical rag service panel. No other panel to live anywhere else. must be accessible from settings advanced" with "a better design for the service controls. large buttons in one row is the wrong shape... name the service, do not call it search. show version number running, path, port, host"; and the A2A lifecycle panel "serves no purpose, to remove. Service status monitoring is dev only and should consolidate under settings advanced." Where do these surfaces live today, and what does the move require?

## Findings

- Today's mounting: `FrameworkStatusCluster` (Search / Review / Project health chips) renders in the desktop right-rail footer and opens `ControlPanels` modal panels — the rag job dashboard and the A2A lifecycle panel among them. The compact rail's mount was already removed in the first review round after finding its chips were dead ends. The chips are the ONLY navigation into those panels today, so a bare removal without a new home orphans the rag controls — the cutover must land as one move (the no-bridges discipline).
- The settings dialog (`frontend/src/app/settings/`) is schema-driven: groups and controls derive from the engine settings registry served at `/settings/schema`; it renders VALUE controls, not arbitrary panels. Hosting service consoles means the dialog gains ONE designed non-schema section (Advanced), not per-surface hand-wired tabs — the schema stays the authority for settings values, and the Advanced section is the sanctioned home for the operational consoles.
- The Review chip is not a dev surface: it carries the pending-approvals count that feeds the agent workflow. The owner's agent-area notes defer agent UX to the in-flight agent-panel campaign — so the approvals ENTRY needs a decision here (keep a minimal approvals affordance in user chrome; the DEV chips go).
- The rag service already exposes over its codified HTTP contract everything the redesigned console needs: `/service-state`, `/jobs`, `/metrics`, `/health`, `/storage/survey` (size, jobs, projects), and the machine-global discovery record (`~/.vaultspec-rag/service.json`) carries pid/port/host/path identity; version is probed through the tier component handshake. Logs: the rag job dashboard already tails job logs through the engine's brokered ops route — the console consolidates these reads, it does not invent new wire.
- The A2A lifecycle plane (`/a2a/lifecycle/*`, `A2aLifecyclePanel`) was built as a user-facing panel; the owner rules it dev-only. The engine routes stay (they serve the dev console); only the user-chrome mounting is removed.

## Options carried forward

1. One Settings ▸ Advanced section hosting the consolidated service console (rag console redesigned as the TUI's UI pair; framework/engine status summary; a2a lifecycle relocated), chips removed from user chrome, approvals affordance retained minimally. (Recommended — matches all four notes.)
2. A separate dev-mode window/page outside Settings — rejected: the owner named Settings Advanced as the canonical home twice.
3. Piecemeal removal now, console later — rejected: orphans rag/a2a controls; violates the full-cutover discipline.
