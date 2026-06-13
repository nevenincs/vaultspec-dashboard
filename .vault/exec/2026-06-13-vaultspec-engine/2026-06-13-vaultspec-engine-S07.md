---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S07'
related:
  - "[[2026-06-13-vaultspec-engine-plan]]"
---

# Flatten the search response to the section 2 envelope with a flat annotated results list, map annotation fields against rag's recorded real JSON shape with a typed miss condition, and assert annotation through a fake-rag fixture returning nonempty results

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Replace the verbatim `{envelope: ...}` wrapper with `flatten_and_annotate`:
  lift rag's `data` to the contract section 2 shape (a flat `results` list,
  rag's query/search_type/via context preserved) and drop the nested foreign
  envelope.
- Add `RagHitShape`, typed against rag's real `search --json` output recorded
  2026-06-13: read `source` as the vault|code DISCRIMINATOR, derive
  `doc:{stem}` from a vault hit's `path` and `code:{path}[#symbol]` from a code
  hit's `path` plus `function_name`/`class_name`.
- Annotate each hit with `node_id`; an unmappable hit yields explicit null,
  never a dropped or guessed id.
- Add `SearchShapeMiss`, a typed miss: rag `ok:false` or an absent `results`
  list degrades the `semantic` tier through the shared envelope helper instead
  of presenting a healthy-looking empty result.
- Add fake-rag fixture unit tests asserting the flattened, annotated shape over
  recorded real JSON.

## Outcome

`/search` returns the section 2 envelope with a flat annotated results list, and
node-id mapping matches rag's real shape - the prior assumption that `source`
was a path mis-derived every id. Three unit tests are green; clippy
(`-D warnings`) and fmt are clean.

## Notes

`source` is rag's `vault|code` discriminator, not a path - the corrected trap is
documented on `RagHitShape`. The sibling `rag-client` HTTP path
(`forward_search`, `discover`, `target_node_id`) still carries the old
`source`-as-path assumption; it was left untouched because it belongs to the
D3.5 semantic-discovery feature and `target_node_id` is identity-bearing (a
change there is a contract event, not a refactor). Flagged for follow-up. Live
`/search` returns zero in this worktree only because the worktree holds no rag
index slot (the running service has slots for other repos); `serve` already
strips the Windows extended-length prefix from the forwarded working directory,
so the suspected project-root normalization is not the cause.
