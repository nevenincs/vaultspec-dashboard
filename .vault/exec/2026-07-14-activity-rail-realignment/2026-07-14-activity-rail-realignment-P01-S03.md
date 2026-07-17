---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S03'
related:
  - "[[2026-07-14-activity-rail-realignment-plan]]"
---

# Design the Backend health and Vault health panel frames - plain-language per-tier availability rows with reasons, core reachability, vault health word plus check verb row

## Scope

- `Figma SlhonORmySdoSMTQgDWw3w BackendHealthPanel VaultHealthPanel`

## Description

## Outcome

## Notes

## Description

- Create `BackendHealthPanel` (1089:4474): modal shell with six health rows - Engine, Documents, Links, History, Semantic search, Framework core - each a tone dot (status/health-* triad) + plain-language name + status word, with quiet reason text on degraded rows (Refreshing - rebuilding after edits; Offline - service not running). Internal tier names never appear.
- Create `VaultHealthPanel` (1089:4504): modal shell with the served health word row (Vault documents - Healthy), a Run check Secondary button, and a quiet receipt line (Last check: clean - 2h ago).

## Outcome

Both dark health planes now have bound designed panels; screenshot verified.

## Notes

Vault-health detail beyond the served health word is out of scope per the ADR constraint.
