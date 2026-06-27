---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Declare lucide-react as a real dependency at the in-tree installed version, ending the phantom-import state

## Scope

- `frontend/package.json`

## Description

- Read the installed `lucide-react` metadata in `node_modules` and confirmed version 1.18.0 with a React peer range of `^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0`, which covers the project's React 19.2.
- Confirmed the phantom-import state: `lucide-react` is imported across seven chrome surfaces yet absent from the manifest's `dependencies`.
- Declared `lucide-react` in `dependencies` at `^1.18.0`, caret-ranged to match the surrounding convention and pinned to the in-tree installed version; placed alphabetically in the block.
- Left all seven existing imports untouched.

## Outcome

The phantom dependency is formalized: `lucide-react` is now a declared dependency at the version already installed, so a clean install resolves the chrome icon imports deterministically. No import or chrome behavior changed.

## Notes

No incidents. The version range matches the installed tree and the project's caret convention; the lockfile entry already existed (the package was physically present) and was unaffected by this declaration alone.
