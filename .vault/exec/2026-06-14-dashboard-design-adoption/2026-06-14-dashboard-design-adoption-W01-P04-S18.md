---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S18'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-design-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S18 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Declare lucide-react as a real dependency at the in-tree installed version, ending the phantom-import state and ## Scope

- `frontend/package.json` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
