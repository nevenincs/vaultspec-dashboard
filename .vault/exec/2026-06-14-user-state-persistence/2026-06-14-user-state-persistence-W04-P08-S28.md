---
tags:
  - '#exec'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S28'
related:
  - "[[2026-06-14-user-state-persistence-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace user-state-persistence with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S28 and 2026-06-14-user-state-persistence-plan placeholders are machine-filled by
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
     The extend the tolerant live adapter for the new shapes and ## Scope

- `frontend/src/stores/server/liveAdapters.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# extend the tolerant live adapter for the new shapes

## Scope

- `frontend/src/stores/server/liveAdapters.ts`

## Description

- Added `adaptSession` and `adaptSettings` tolerant adapters plus two private
  helpers (`adaptScopeContext`, `adaptStringMap`) to the live-adapter module.
- `adaptSession` defaults every missing field to a safe empty: absent
  `scope_context` → `{ folder: null, feature_tags: [] }`, absent `recents` → `[]`,
  absent `workspace`/`active_scope` → empty string, absent `tiers` → empty block.
  A non-object body returns the fully-defaulted empty session, so a
  freshly-recreated best-effort store restores as "no selection yet" rather than
  throwing on load.
- `adaptSettings` defaults absent `global`/`scoped` to empty maps, drops
  non-string values, and tolerates a sparse-omitted scope; the client composes
  precedence over whatever is present without guarding for missing keys.
- Both run after the client's `unwrapEnvelope` step, so a live `{data, tiers}`
  body and an internal (mock) body both flow through one code path — the
  tolerance is the S49 one-code-path property carried to the new surface.

## Outcome

The session/settings surface never throws on a sparse or older shape; the chrome
never has to read the raw tiers block — degradation truth rides through on the
defaulted `tiers`. Frontend `tsc -b` and `prettier --check` are clean.

## Notes

The adapter code landed in the same change as the S25 client methods because the
client imports `adaptSession`/`adaptSettings` and could not compile without them
(the per-commit gate must stay green); this Step's record documents the adapter
contract, and the S34 parity test proves the tolerance against a captured-live
sample. No skips, no stubs.
