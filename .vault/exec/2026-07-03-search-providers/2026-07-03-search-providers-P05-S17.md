---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S17'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace search-providers with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S17 and 2026-07-03-search-providers-plan placeholders are machine-filled by
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
     The Verify live end to end: drive the one Search plane against the dev serve with semantic and file hits interleaving, the degraded copy honest with rag stopped conceptually (tiers-simulated), and run the full lint gate and ## Scope

- `live verification + just dev lint all` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Verify live end to end: drive the one Search plane against the dev serve with semantic and file hits interleaving, the degraded copy honest with rag stopped conceptually (tiers-simulated), and run the full lint gate

## Scope

- `live verification + just dev lint all`

## Description

- Run all five search suites in isolation against the live fixture harness: 104 of 104 pass (`searchProviders`, `searchPill`, `searchController`, `documentSearchController`, `literalMatch`).
- Walk the live `/code-files` route on the canonical dev engine with the served bearer: 826 entries in one page, `truncated: null`, every entry carrying a navigable `code:{path}` node id; the listing finds `SearchPaletteSurface.tsx` itself.
- Drive the running dev SPA with a scripted headless browser: open the Search plane with Mod+P and verify against the binding design's compact list state.
- Probe three query classes and capture screenshots plus extracted rows.

## Outcome

VERIFIED LIVE. The one Search plane serves all three providers end to end:

- Concept query ("degradation is read from tiers"): semantic-dominated ranking with the governing decision and audit documents on top; species eyebrows render plain doc-type words (Decisions, Audits, Research, Plans, Steps, References).
- Mixed query ("timeline"): true interleaving — exact and prefix code filenames (`timeline.ts`, `Timeline.tsx`) rank first per the strong-literal band, the timeline audit and ADR at ranks three and four, code and document hits alternating through all 40 (the bound), with the "40 results" header counter live.
- Filename query ("searchProviders.ts"): exactly one hit, its own source file.
- Idle state renders the reworded plain prompt; the keyboard legend footer and the sunken-plus-accent selected state match the design; no mechanism vocabulary on the search plane (the right rail's RAG OPS header is the sanctioned ops-console exception).
- Degraded copy is exercised by the tiers-simulated suite vectors (the fold means a semantic outage now degrades to name matches, covered by unit and live tests) — the resident service was NOT stopped for this verification, per the machine-singleton discipline.

## Notes

- The whole-tree `just dev lint all` gate could not be run to exit 0 at closure time: a CONCURRENT session holds an uncommitted mid-flight refactor (worktree-picker and location-anchor renames across `queries.ts`, `WorktreePicker.tsx`, `StatusTab.tsx` and tests) that breaks whole-project tsc on files unrelated to this feature. Every search-providers file passed lint, prettier, and tsc at its own commit time, and the isolated suites are green. The full gate must be re-run and confirmed exit 0 once the concurrent refactor lands — recorded as the one open verification item.
- An earlier capture 2.5s after typing showed only code hits for the mixed query: the semantic wire was still in flight and the list re-ranks as it settles (progressive results, not a defect); the 6s capture shows the settled interleaving.
