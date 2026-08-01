---
tags:
  - '#plan'
  - '#code-tree-legibility'
date: '2026-08-01'
modified: '2026-08-01'
body_hash: 'sha256:51558b241287d956fe88b0c5acc70f482597bc0fb0f1fb5ab08a74904b62ad87'
tier: L2
related:
  - '[[2026-08-01-code-tree-legibility-adr]]'
  - '[[2026-08-01-code-tree-legibility-research]]'
---

# `code-tree-legibility` plan

### Phase `P01` - Engine: served ignore and status truth

The walk adopts gix-based ignore evaluation and the memoized git-status join, serving ignored and git_status per entry, with the icon setting declared in the registry.

- [x] `P01.S01` - Adopt gix-based ignore evaluation in the file-tree walk, serving ignored (git | rag via .vaultspecragignore through the same matcher) and showing ignored entries instead of hiding, retiring the directory-name pattern collection; `engine/crates/ingest-git/src/file_tree.rs, engine/crates/vaultspec-api`.
- [x] `P01.S02` - Serve git_status per entry from a per-scope status snapshot memoized on the git rollup, invalidated by the existing git SSE channel, never spawning a subprocess per level; `engine/crates/ingest-git, engine/crates/vaultspec-api`.
- [x] `P01.S03` - Declare the code_tree.file_icons setting (default on) in the settings registry; `engine/crates/vaultspec-session/src/settings_schema.rs`.
- [x] `P01.S04` - Cover the walk with fixtures for ignored (git and rag), status join, pagination and ceilings unchanged, and run cargo fmt plus clippy plus the crate tests green; `engine/crates/ingest-git, engine/crates/vaultspec-api`.

### Phase `P02` - Frontend: three-channel rows behind the setting

Stores adapters widen, the pinned icon subset lands behind the setting, and tree rows render icon plus label tone plus dimming from served tokens, reviewable on the desk.

- [x] `P02.S05` - Widen FileTreeEntry and the tolerant adapters with git_status and ignored, expose the effective icon setting through stores; `frontend/src/stores/server`.
- [x] `P02.S06` - Bundle the pinned material-icon-theme subset with its manifest-derived mapping behind the setting, with the generic fallback when off or unmapped; `frontend/src/app/left, frontend/package.json`.
- [x] `P02.S07` - Render the three-channel row treatment (type icon, status label tone plus one-letter badge, ignored dimming) from semantic tokens, and add the sanctioned-exception clause to the design-system rule source; `frontend/src/app/left/CodeTree.tsx, .vaultspec/rules/design-system.md`.
- [x] `P02.S08` - Author desk specimen states for status and ignored values, update row tests, and run the full frontend gate plus touched-scope vitest green; `frontend/dev/visual-review/specimens, frontend/src/app/left`.

## Description

## Steps

## Parallelization

## Verification
