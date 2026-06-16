---
tags:
  - '#exec'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S02'
related:
  - "[[2026-06-16-status-overview-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace status-overview with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S02 and 2026-06-16-status-overview-plan placeholders are machine-filled by
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
     The Add bounded useHistory query + deriveHistoryView (tiers-gated), engine client + adapter, mock /history route + fidelity test and ## Scope

- `frontend/src/stores/server/queries.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add bounded useHistory query + deriveHistoryView (tiers-gated), engine client + adapter, mock /history route + fidelity test

## Scope

- `frontend/src/stores/server/queries.ts`

## Description

- Add the `HistoryCommit`, `HistoryTruncated`, and `HistoryResponse` wire types to the engine module, snake_case mirroring the live route, with `ts` in milliseconds.
- Add the engine client `history({scope, limit})` method routed through the shared get/envelope-unwrap path, returning the tolerant-adapted shape.
- Add `adaptHistory` (and its `adaptHistoryCommit`/`adaptHistoryTruncated` helpers) — tolerant: an absent body yields an empty list with an empty tiers block, a malformed row is dropped, and an absent `short_hash` is derived from the hash.
- Add the bounded `useNodeHistory` query (keyed on scope+limit, explicit `gcTime`, disabled until a scope resolves) and the `deriveHistoryView`/`useHistoryView` hook that reads degradation from the served `tiers` structural truth (fresh error tiers winning over a stale block), never from a transport error.
- Add the mock `/history` route + `historyData` builder mirroring the live wire shape exactly (newest-first, subject from the commit node title, commit node ids correlated, same default + ceiling clamp).
- Add tests: mock fidelity through the real client path (`adaptHistory`), over-ceiling clamp, `deriveHistoryView` degradation matrix (absent tier, tiers-bearing error, tiers-less fault, fresh-over-stale), and `adaptHistory` live-shape tolerance.

## Outcome

The stores layer is the sole wire client of `/history`; the query is bounded at creation and degradation derives from tiers. Mock mirrors the live shape and is proven through the same client path the app uses. Frontend stores/mock/adapter tests pass (78 + 42).

## Notes

None.
