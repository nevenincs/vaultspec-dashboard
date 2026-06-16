---
generated: true
tags:
  - '#index'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - '[[2026-06-16-review-rail-viewers-P01-S01]]'
  - '[[2026-06-16-review-rail-viewers-P01-S02]]'
  - '[[2026-06-16-review-rail-viewers-P01-S03]]'
  - '[[2026-06-16-review-rail-viewers-P01-S04]]'
  - '[[2026-06-16-review-rail-viewers-P01-S05]]'
  - '[[2026-06-16-review-rail-viewers-P01-S06]]'
  - '[[2026-06-16-review-rail-viewers-P02-S07]]'
  - '[[2026-06-16-review-rail-viewers-P02-S08]]'
  - '[[2026-06-16-review-rail-viewers-P02-S09]]'
  - '[[2026-06-16-review-rail-viewers-P02-S10]]'
  - '[[2026-06-16-review-rail-viewers-P02-S11]]'
  - '[[2026-06-16-review-rail-viewers-P03-S12]]'
  - '[[2026-06-16-review-rail-viewers-P03-S13]]'
  - '[[2026-06-16-review-rail-viewers-P03-S14]]'
  - '[[2026-06-16-review-rail-viewers-P03-S15]]'
  - '[[2026-06-16-review-rail-viewers-P04-S16]]'
  - '[[2026-06-16-review-rail-viewers-P04-S17]]'
  - '[[2026-06-16-review-rail-viewers-P04-S18]]'
  - '[[2026-06-16-review-rail-viewers-P04-S19]]'
  - '[[2026-06-16-review-rail-viewers-P04-S20]]'
  - '[[2026-06-16-review-rail-viewers-P04-S21]]'
  - '[[2026-06-16-review-rail-viewers-P05-S22]]'
  - '[[2026-06-16-review-rail-viewers-P05-S23]]'
  - '[[2026-06-16-review-rail-viewers-P05-S24]]'
  - '[[2026-06-16-review-rail-viewers-P05-S25]]'
  - '[[2026-06-16-review-rail-viewers-P07-S33]]'
  - '[[2026-06-16-review-rail-viewers-P07-S34]]'
  - '[[2026-06-16-review-rail-viewers-P07-S35]]'
  - '[[2026-06-16-review-rail-viewers-P07-S36]]'
  - '[[2026-06-16-review-rail-viewers-adr]]'
  - '[[2026-06-16-review-rail-viewers-audit]]'
  - '[[2026-06-16-review-rail-viewers-plan]]'
  - '[[2026-06-16-review-rail-viewers-research]]'
---

# `review-rail-viewers` feature index

Auto-generated index of all documents tagged with `#review-rail-viewers`.

## Documents

### adr

- `2026-06-16-review-rail-viewers-adr` - `review-rail-viewers` adr: `document + code viewers, content endpoint, right-rail overview IA` | (**status:** `accepted`)

### audit

- `2026-06-16-review-rail-viewers-audit` - `review-rail-viewers` audit: `review-rail-viewers code review`

### exec

- `2026-06-16-review-rail-viewers-P01-S01` - Add a MAX_CONTENT_BYTES ceiling and a content reader resolving a doc:/code: node id to its repo-relative path
- `2026-06-16-review-rail-viewers-P01-S02` - Implement GET /nodes/{id}/content: validate scope, guard path traversal, read bytes via read_from_worktree/read_from_ref, derive language_hint from extension
- `2026-06-16-review-rail-viewers-P01-S03` - Return {path, blob_hash, byte_len, language_hint, text, truncated} through the shared envelope with the tiers block, byte-capped with an honest truncated block
- `2026-06-16-review-rail-viewers-P01-S04` - Degrade the structural tier on an unreadable worktree and return a tiered 400 on traversal or missing path via degraded_tiers_for and api_error
- `2026-06-16-review-rail-viewers-P01-S05` - Register the route and add it to CONTRACT_ROUTES, bearer-gated by the existing middleware
- `2026-06-16-review-rail-viewers-P01-S06` - Add engine tests for success, byte-cap truncation, traversal 400, and structural degradation
- `2026-06-16-review-rail-viewers-P02-S07` - Add a bounded content query keyed by {scope, nodeId} with explicit gcTime and a cache cap, as the sole wire client of /nodes/{id}/content
- `2026-06-16-review-rail-viewers-P02-S08` - Add a tolerant content adapter normalizing the wire shape, blob_hash content-addressing the cache entry
- `2026-06-16-review-rail-viewers-P02-S09` - Mirror the live /nodes/{id}/content shape exactly in the mock engine and feed a captured live sample through the adapter in a fidelity test
- `2026-06-16-review-rail-viewers-P02-S10` - Expose a content selector that derives degraded/offline state from the tiers block, never from a transport error
- `2026-06-16-review-rail-viewers-P02-S11` - Add a view-store open-in-viewer intent carrying the target node id and the active viewer surface
- `2026-06-16-review-rail-viewers-P03-S12` - Add shiki/core, the JS regex engine, and the lang/theme packages to the frontend dependencies (runtime, never rag/torch)
- `2026-06-16-review-rail-viewers-P03-S13` - Build a useHighlighter hook owning a singleton createHighlighterCore with per-language and per-theme dynamic import lazy registration
- `2026-06-16-review-rail-viewers-P03-S14` - Bind Shiki token colors to the OKLCH semantic token tier so light, dark, and high-contrast are three theme maps with no per-surface color
- `2026-06-16-review-rail-viewers-P03-S15` - Map the required language set and the long tail to grammar loaders and a language_hint resolver shared by both viewers
- `2026-06-16-review-rail-viewers-P04-S16` - Add react-markdown, remark-gfm, and frontmatter handling to the frontend dependencies
- `2026-06-16-review-rail-viewers-P04-S17` - Build the MarkdownReader component rendering GFM including plan task-list checkboxes, themed entirely from the existing --color tokens
- `2026-06-16-review-rail-viewers-P04-S18` - Render the leading YAML block through a dedicated FrontmatterHeader: tags as pills, date and modified as stamps, related as clickable wiki-links
- `2026-06-16-review-rail-viewers-P04-S19` - Add a custom remark plugin rewriting double-bracket stem and stem-pipe-label wiki-link syntax into in-app link nodes resolving to doc:stem and emitting the navigation intent
- `2026-06-16-review-rail-viewers-P04-S20` - Override fenced code rendering to delegate to the shared useHighlighter hook so reader fences and the code viewer share one tokenizer
- `2026-06-16-review-rail-viewers-P04-S21` - Render the reader degraded, empty, and error states from the tiers-derived content selector
- `2026-06-16-review-rail-viewers-P05-S22` - Build the CodeViewer component taking {path, text, language_hint}, picking the grammar via the shared hook, rendering highlighted lines with line numbers and a monospace path header
- `2026-06-16-review-rail-viewers-P05-S23` - Virtualize the line list so a large capped file scrolls cheaply, with no editing affordances
- `2026-06-16-review-rail-viewers-P05-S24` - Render the viewer degraded, empty, truncated, and error states from the tiers-derived content selector and the truncated block
- `2026-06-16-review-rail-viewers-P05-S25` - Host the two viewers behind the open-in-viewer view-store intent so a selection routes to the markdown reader or the code viewer by node kind
- `2026-06-16-review-rail-viewers-P07-S33` - Run the full frontend lint gate and the engine fmt-plus-clippy gate to exit 0 including prettier format:check and tsc
- `2026-06-16-review-rail-viewers-P07-S34` - Add component tests for frontmatter rendering, wiki-link navigation, GFM task lists, and code highlighting across light, dark, and high-contrast themes
- `2026-06-16-review-rail-viewers-P07-S35` - Verify the four-tab law holds and every Overview row cross-links to file, node, and viewer with no inlined content
- `2026-06-16-review-rail-viewers-P07-S36` - Run vaultspec-code-review over the feature and land any required revisions to a PASS verdict

### plan

- `2026-06-16-review-rail-viewers-plan` - `review-rail-viewers` plan

### research

- `2026-06-16-review-rail-viewers-research` - `review-rail-viewers` research: `document and code viewers + right-rail overview IA`
