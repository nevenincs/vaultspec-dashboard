---
tags:
  - '#exec'
  - '#dashboard-settings'
date: '2026-06-15'
modified: '2026-07-12'
step_id: 'S13'
related:
  - "[[2026-06-15-dashboard-settings-plan]]"
---

# Extend mockEngine to serve the schema route and typed values byte-for-byte as the live engine

## Scope

- `frontend/src/stores/server/mockEngine.ts`

## Description

- Extended `mockEngine` to mirror the live registry byte-for-byte, serve `/settings/schema`, and validate `PUT` with the same typed `error_kind`s (RouteError gained an optional kind).

## Outcome

The mock serves the schema + typed errors identically to live.

## Notes
