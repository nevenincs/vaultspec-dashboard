---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
body_hash: 'sha256:76c7e69938afb9bceded64ac8c5caab0a2e519b11528ffc4fd128ed0d781366a'
step_id: 'S20'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Configure installer-created launch shortcuts in the dist pipeline and document install, first-run, lifecycle verbs, the app home, and uninstall (naming the machine-global state) in the user docs

## Scope

- `dist-workspace.toml + docs/`

## Description

- Add `docs/application-runtime.md`: opening the app (bare invocation/double-click), the one-app-per-machine rule and its dev/test escape hatches, the lifecycle verb table, provisioning verbs, the app-home file inventory with uninstall guidance, and Windows notes (console flash, Start-Menu pinning, crash-loop behavior).

## Outcome

The runtime story is documented end to end for users.

## Notes

Installer-created Start-Menu shortcuts are NOT a dist shell/powershell feature; documented pinning today and recorded MSI as the packaging-ADR v2 path rather than hand-rolling installer changes here.
