---
tags:
  - '#audit'
  - '#backend-hotpath-hardening'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-backend-hotpath-hardening-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace backend-hotpath-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `backend-hotpath-hardening` audit: `hot-path memoization and stores bounding review`

## Scope

The backend-hotpath-hardening wave (research F1-F3): the per-generation
memoization of the content route's `.vault` doc lookup, and the bounding of two
stores caches. Reviewed independently; engine and frontend gates green.

## Findings

### Verdict: PASS (no Critical/High, two LOW cosmetic nits, both applied)

- **F1 (engine, done):** `find_vault_doc`'s per-request full `.vault` tree walk is
  replaced by `build_doc_basename_index` cached on the `ScopeCell` behind a
  generation-keyed `doc_index_cache`, mirroring the existing
  `meta_edges`/`document_views`/`salience_basis` memo pattern exactly (same
  poison-recovery lock, generation check, Arc clone-out). The reviewer confirmed
  no staleness window (the cell persists across rebuilds; the generation bump on
  `commit_graph` forces a rebuild on the next fetch) and byte-for-byte semantic
  parity with the old `sort()+first()` tie-break. The `code:` branch is
  unaffected. A `doc_index_tie_break` test pins the determinism.
- **F2 (stores, done):** `useSettingsSchema` (gcTime 60s) and the engine stream
  options (gcTime 30s) now declare an explicit bound, closing the
  `staleTime:Infinity`-with-no-`gcTime` defect named by
  `bounded-by-default-for-every-accumulator`. The always-observed session stream
  is unaffected (the bound is an unmount safety net); `since=` resume is
  keyframe-anchored, not array-anchored, so dropping the 256-chunk array on an
  unobserved stream loses no correctness.
- **F3 (declined, documented):** the `streamReducer` O(N) seq-dedup is left as the
  bounded O(256) `.some()`. The reviewer agreed: a pure reducer cannot carry an
  O(1) Set without rebuilding it per call (no gain) or impure cross-stream state
  (a correctness/quality regression); the scan is network-paced and hard-capped.

### Rule adherence

`engine-read-and-infer` (the index is read-only, derived, cell-local),
`bounded-by-default-for-every-accumulator` (generation-keyed cache + the gcTime
additions), `dashboard-layer-ownership` (gcTime lives in the stores wire client).

## Recommendations

- **Deferred to later campaign waves** (verified in research, lower priority):
  F4 (memoize `graph_query_inner`'s per-request `scope_nodes` full scan per
  generation), F5 (`filter.rs` const-array `.iter().any()` → prebuilt sets), F6
  (stream reducer ring buffer to avoid the per-chunk 256-array slice).

<!-- Actionable recommendations -->

## Codification candidates

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
