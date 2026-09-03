---
tags:
  - '#exec'
  - '#advanced-service-console'
date: '2026-08-01'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:3efb49bc683492ea3b69c8c46af5d4470149fbb8392a3ba8c5ab174830f74d30'
step_id: 'S03'
related:
  - "[[2026-08-01-advanced-service-console-plan]]"
---

# Relocate the A2A lifecycle panel as a dev subsection under Advanced and add the compact engine-status block from existing status reads

## Scope

- `frontend/src/app/settings`
- `frontend/src/app/panels`

## Description

- Mount the agent lifecycle panel as the fourth Advanced fold, served by its existing lifecycle plane unchanged - no new route, no new client model.
- Mount the backend-health panel as the system-status fold, deriving degraded and offline only from the served tiers block.
- Mount the project-health panel as the third fold, so the health dashboard the rail footer used to reach now lives beside the others.
- Leave the per-surface degradation treatments elsewhere in the chrome untouched: this Step moves the DASHBOARD of statuses, not the honest degradation each surface renders for itself.

## Outcome

The three status surfaces and the agent lifecycle console sit under one section, each mount-gated behind its own fold. Operational status is one click deeper than the retired rail chips and no longer occupies user chrome. If the agent campaign later supersedes the lifecycle console, it retires from exactly one place.

## Notes

The lifecycle plane was left entirely alone - only its mounting moved, which is what keeps a future supersession cheap.

SUPERSEDED IN PART, same day. The agent lifecycle console this Step relocated under Advanced was afterwards RETIRED outright by owner ruling, recorded as the D5 retirement amendment on the governing decision record. D5 had anticipated it - "if the agent-panel campaign later supersedes it, it retires from ONE place" - and relocating it first is what made the retirement a single deletion rather than a hunt. The rest of this Step stands: the system-status and project-health blocks remain under Advanced, because the ruling removed service CONTROL from the product and kept service MONITORING.
