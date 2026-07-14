---
tags:
  - '#adr'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-activity-rail-realignment-research]]"
  - '[[2026-06-16-status-overview-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-07-12-authoring-surface-adr]]'
  - '[[2026-07-12-mobile-unified-rail-adr]]'
---

# `activity-rail-realignment` adr: `status-only rail, footer status cluster, Figma-designed control panels` | (**status:** `accepted`)

## Problem Statement

The right activity rail conflates two responsibilities. Its status sections
(Changes, Plans, Pull requests, Issues, Commits) answer the operator's glance
questions, but the same scroll also embeds two full ADMIN CONSOLES — the
machine-level search-service management surface and the agentic-authoring
Approvals queue — rendered in every rail state. Meanwhile two served health
planes have no surface at all: backend/tier health has no central overview, and
core vault health (`core.reachable` / `vault_health` on `/status`) has zero
chrome consumers. The user directs a major realignment: the rail reports
status only; advanced control surfaces become dedicated pop-up panels reached
from a compact framework status cluster, every element designed in Figma
before implementation. Grounding is the same-feature research document.

## Considerations

- The conflation is inherited by decision, not accident: `dashboard-gui` §2.3
  placed pillar-2 operational verbs inline in the rail; `rag-service-management`
  D7 mounted the console as a rail section; the `authoring-surface` epic
  mounted the review station beside it. Each placement is amendable without
  touching the consoles' internals, wire contracts, or action wiring.
- Both consoles are already glass over stores hooks (dashboard-layer-ownership
  holds), so relocation is a chrome re-mount, not a stores or engine change.
- The Settings dialog is the proven pop-up idiom end to end: the one modal
  `Dialog` chrome primitive, a tiny view-store open flag, and one
  `ActionDescriptor` enrolled across palette/keymap.
- The compact shell (mobile-unified-rail) inherits whatever the rail carries;
  today that includes both consoles' bloat. Modal panels work on compact
  unchanged.
- Health tones and counts must be backend-served projections read through
  stores selectors (wire-contract; degradation-is-read-from-tiers).
- Figma is the binding source of truth; the design system is centralized — new
  chrome (cluster strip, chips, panel frames) must be designed as bound frames
  composed from the Kit before code mirrors them.

## Considered options

- **Status quo plus more folds** — keep admin sections inline, add health
  folds. Rejected: deepens the conflation; every rail state carries admin
  chrome; compact scroll grows further.
- **Admin tab in the rail** — a second rail tab (Status | Manage). Rejected:
  the rail's tab retirement (status-overview line) was deliberate; a hidden
  tab re-creates the discoverability failure the tab retirement fixed.
- **Docked overlay side panel** — a slide-over panel over the rail. Rejected
  for v1: needs a new chrome primitive plus a compact variant; the modal
  Dialog already exists and fits both consoles.
- **Rail-footer status cluster + modal panels** — chosen (user-selected):
  the rail keeps status; a pinned footer strip of served-health chips toggles
  Figma-designed modal panels hosting the control surfaces.

## Constraints

- The engine serves everything v1 needs (`/status` tiers + core rollup, rag
  control plane, review-station projection); no new wire capability is
  required. A richer vault-health detail (per-condition counts) would need a
  core `vault check` ingestion — explicitly OUT of scope; the panel renders
  the served health word and hosts the existing ops verbs only.
- Persisted `statusTabChrome` section ids `rag-ops`, `rag-ops:details`,
  `authoring-review` retire; the store's normalizer already drops unknown ids
  on rehydrate, so deletion needs no migration shim (no-deprecation-bridges).
- The realignment must not regress keyboard reach: chips join the rail's
  roving F6/arrow model, and each panel is focus-trapped by the Dialog.
- Figma write access (the `use_figma` MCP) is flaky per prior campaigns;
  design-first sequencing must tolerate authoring frames in batches.

## Implementation

D1 — **The rail is status-only.** `StatusTab` renders exactly: the Changes
fold, Plans, Pull requests, Issues, Commits. The `rag-ops` and
`authoring-review` SectionCards are deleted from the rail (their section ids
retire from `statusTabChrome`).

D2 — **A pinned rail-footer status cluster.** A slim strip pinned to the
activity rail's bottom edge (outside the scroll region) renders one chip per
framework plane: Search service, Approvals, Backend health, Vault health.
Each chip shows only a served health tone (the standard status-dot vocabulary)
plus at most one served count (e.g. pending approvals); no inline detail. The
cluster is one FocusZone tab stop; chips act as toggles for their panels.

D3 — **Four modal control panels on the Settings-dialog idiom.** Each panel is
the one `Dialog` chrome primitive over a per-panel view-store open flag
(non-persisted, like the settings dialog): Search service (re-mounts the
existing console body), Approvals (re-mounts the review station), Backend
health (NEW: the served per-tier availability with plain-language names,
reasons, and the engine/core reachability rollup), Vault health (NEW: the
served `vault_health` word plus the existing vault-check ops verb with its
receipt). Panels mount their bodies only while open, so the heavy rag
aggregate and review-queue reads fire only on open (mount-gating law).

D4 — **One descriptor per panel toggle.** Each panel open/close verb is a
single `ActionDescriptor` enrolled in the command palette and the keymap
registry, with the chip as its visible trigger — no bespoke handlers
(actions-keymap-palette law). Panel badge counts are engine-served rollups.

D5 — **Figma-first for every element.** Before implementation: bound frames
for the footer cluster (resting/hover/attention states of each chip), and one
frame per panel (Search service, Approvals, Backend health, Vault health),
composed from the Kit on the token scale. Code mirrors the frames
(name-as-contract); the stale search-console binding (`879:4125`) is replaced
by the new panel frame.

D6 — **Compact shell parity.** The cluster joins the compact unified rail's
footer; panels open as the same modal dialogs (already compact-safe). The
compact scroll LOSES the two inline consoles — a net reduction.

## Rationale

Research F1/F2 establish the conflation and the two dark health planes; F4
establishes that the Settings-dialog idiom already solves container, open
state, and action enrollment; F5 establishes the moves are chrome-only. The
footer placement keeps the status stack leading while making framework health
ambient — visible at rest, actionable in one click, silent otherwise. Modal
panels are the only container that fits the existing 600-line consoles
unchanged on both desktop and compact. Making every element a bound Figma
frame first is the standing design-system law and an explicit user directive
on this feature (2026-07-14).

## Consequences

- The rail reads as one coherent status surface; admin depth is one click
  away instead of inline; compact loses ~1200 lines of always-mounted admin
  chrome from its scroll.
- Backend health and vault health become visible for the first time, from
  already-served data.
- Users lose the persisted open/closed state of the two admin folds (panels
  are session-transient like Settings) — acceptable: consoles are visited,
  not lived in.
- The `/status.html` parity harness and rail guard tests must be re-pinned to
  the status-only composition; the review-station and rag-console tests move
  with their surfaces.
- The Figma design pass (D5) becomes the critical path; implementation waits
  on bound frames per the design-system law.
- Opens a clean pathway for future panels (e.g. provisioning, data activity
  detail) to enroll as cluster chips without touching the rail again.
