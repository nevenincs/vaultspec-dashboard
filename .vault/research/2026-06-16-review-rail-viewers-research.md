---
tags:
  - '#research'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-14-dashboard-activity-rail-adr]]'
  - '[[2026-06-14-dashboard-code-tree-adr]]'
  - '[[2026-06-14-dashboard-pipeline-status-adr]]'
  - '[[2026-06-14-dashboard-pipeline-wire-adr]]'
---

# `review-rail-viewers` research: `document and code viewers + right-rail overview IA`

This research grounds three intertwined, currently-missing surfaces: (1) a
frontmatter-aware Markdown **reader** for `.vault/` documents and general
markdown, display-only; (2) a read-only syntax-highlighted **code-file viewer**;
and (3) a re-scoped **right rail** as an informational overview panel rather than
a file/content browser. It covers a library evaluation for the two viewers, the
backend content-fetch gap, and a from-scratch IA analysis of the rail. The
current implementation is treated as suspect throughout; every claim is pinned to
`file:line` evidence read on 2026-06-16.

## Findings

### F1 — There is no content rendering anywhere in the frontend, and no library for it

A full sweep of `frontend/src/` and `frontend/package.json` found **zero** content
rendering capability. No `react-markdown`/`remark`/`rehype`, no
`shiki`/`prismjs`/`highlight.js`/`react-syntax-highlighter`, no
`codemirror`/`@monaco-editor`. The runtime deps are graph/render/state libraries
only: `@pixi/react`, `pixi.js`, `sigma`, `d3-force`, `@tanstack/react-query`,
`@tanstack/react-router`, `zustand`, `lucide-react`, `@phosphor-icons/react`
(`frontend/package.json` dependencies block). Tailwind v4 + Style Dictionary OKLCH
tokens are the styling substrate.

Clicking a document or code row in the left rail today does **not** open or render
anything — it only selects a graph node. `handleEntryClick` in
`frontend/src/app/left/browserSelection.ts:28-31` calls
`selectNode(pathToNodeId(entry.path))`; `handleCodeEntryClick` at
`browserSelection.ts:79-84` calls `selectNode(entry.node_id || codePathToNodeId(entry.path))`.
The three browser modes (`VaultBrowser.tsx`, `TreeBrowser.tsx`, `CodeTree.tsx`,
hosted by `frontend/src/app/left/BrowserRegion.tsx:50-56`) are pure
navigation/selection surfaces with no viewer. **Conclusion: the reader and the
code viewer are genuine new headline features, not refactors.**

### F2 — The backend has the body-reading primitive but serves no content route

The engine route table (`engine/crates/vaultspec-api/src/lib.rs:37-63`,
`CONTRACT_ROUTES`) lists `/vault-tree`, `/file-tree`, `/map`, `/pipeline`, the
`/graph/*` family, `/nodes/*`, `/events`, `/status`, `/stream`, `/search`,
`/ops/*`, `/session`, `/settings`. **Every listing route is metadata-only.**

- `/vault-tree` (`routes/query.rs:138-193`) emits per-doc `{stem, node_id, feature_tags, title, doc_type, dates, status, tier, progress}` — no body.
- `/file-tree` (`routes/file_tree.rs:89-178`, `child_to_wire` at `72-87`) emits `{path, kind, has_children, node_id}` — no bytes.

The body-reading primitive already exists but is **never wired to a route**:
`ingest-struct/src/reader.rs:42-77` provides `read_from_worktree(worktree_root, rel_path) -> DocumentBody`
and `read_from_ref(repo_dir, reference, rel_path)` for the remote-ref scope path,
where `DocumentBody { path, text, blob_hash }` carries the git-style blob oid
(`blob_oid` at `reader.rs:33`). A `grep` for `read_from_worktree|read_from_ref|DocumentBody`
across `vaultspec-api/src` returns nothing — **confirmed: no API route serves
document or file bytes today.** The viewer backend is a single new bounded,
read-only, enveloped content-fetch route.

### F3 — The content route was explicitly reserved by the contract and the code-tree ADR

This is not new scope creep; it is a reserved, deferred rev. Two settled documents
defer content fetch to a deliberate future endpoint:

- Foundation contract §11 W1 (`2026-06-12-dashboard-foundation-reference`, lines 309-318): evidence documents carry `{path, doc_type}` only, no content; the wishlist requests "an optional bounded `excerpt` field ... or cursor-paginated full content (which would also serve search-result previews)." Engine-side note: "bounded excerpts are cheap (the body bytes are already read for extraction and the blob hash keys a cache); full content paging is heavier and should ride a deliberate rev."
- The code-tree ADR (`2026-06-14-dashboard-code-tree-adr`, Constraints "Read-only, no content"): "it never returns file bytes ... Content preview, if it ever lands, rides the foundation §9/§W1 evidence-excerpt rev, not this surface." The Risks section names "the standing temptation ... to add a content preview 'because the bytes are right there'" and explicitly defers it.

**Conclusion: this feature IS the reserved content rev. It must land as a new
endpoint (or `/nodes/{id}/content`), not bolted onto `/vault-tree`/`/file-tree`,
preserving those routes' metadata-only contract.**

### F4 — The endpoint has a complete reuse template (validation, traversal-safety, bounding, tiers)

A content route can be assembled almost entirely from settled primitives:

- **Scope → worktree root:** `validate_scope` → `registry::get_or_build` → `validate_scope_token` (`engine/crates/vaultspec-api/src/registry.rs:579-605`) resolves a scope token to a `.vault`-bearing worktree path and rejects non-selectable scopes.
- **Path-traversal safety:** `resolve_within_root` (`engine/crates/ingest-git/src/file_tree.rs:110-127`) refuses `..`/absolute components before touching disk — the exact guard a path-keyed content read needs. The 400-vs-degrade error split is modelled at `routes/file_tree.rs:106-135`.
- **Shared envelope + tiers (mandated):** `envelope(data, tiers, next_cursor)` (`routes/mod.rs:90-98`), `query_tiers`/`degraded_tiers_for` (`routes/mod.rs:24-85`), `paginate` (`engine-query/src/envelope.rs:79-104`). The `every-wire-response-carries-the-tiers-block` rule forbids a hand-built body.
- **Bounding discipline:** `MAX_GRAPH_NODES = 5000` (`engine-query/src/graph.rs:46`), `MAX_LEVEL_CHILDREN = 2000` / `DEFAULT_PAGE_SIZE = 500` (`routes/file_tree.rs:39-50`), `MAX_REQUEST_BODY = 1 MiB` (`lib.rs:22-27`), each with a `truncated` honesty block (`query.rs:489-502`, `lineage.rs:254-270`). A content route adds a byte ceiling (`MAX_CONTENT_BYTES`) and a cursor over text ranges.
- **Stable interlink:** `node_id(key)` (`engine-model/src/id.rs:84-87`) yields `doc:<stem>` and `code:<path>`; the content route keys on the same ids the trees and graph already use — no new identity scheme.

### F5 — Code highlighter library evaluation (the load-bearing decision)

Evaluated against: language coverage/accuracy, theming bound to OKLCH token
themes incl. high-contrast, bundle size + lazy grammar loading,
performance/large-file handling, SSR/Vite fit, and maintenance.

| Library | Coverage & accuracy | Theming to OKLCH/HC tokens | Bundle + lazy grammars | Large files | Vite/SSR fit | Maintenance |
| --- | --- | --- | --- | --- | --- | --- |
| **Shiki** | VS Code-grade TextMate grammars; the full target set (py, rs, js, ts, jsx/tsx, bash, batch, powershell, c, c++, json, toml, yaml, md) + long tail | **Best fit.** Dual-theme `defaultColor:false` emits `--shiki-*` CSS-variable spans, OR a `css-variables` theme binds tokens to our own vars; theme is data, so light/dark/HC are three token maps — no per-component color | **Best fit.** `createHighlighterCore` + per-lang/theme dynamic `import()` (`@shikijs/langs/*`, `@shikijs/themes/*`); only loaded grammars ship | Tokenizes to HAST; works on demand. Very large files mitigated by the bounded backend (byte cap) + virtualized render | **Excellent.** `createJavaScriptRegexEngine` avoids the Oniguruma WASM entirely — no WASM asset, clean Vite build, SSR-safe async | Active, VS Code-aligned, de-facto standard for docs toolchains |
| CodeMirror 6 (read-only) | Lezer grammars, good but fewer than TextMate; per-language packages | Themable via `EditorView.theme`/`HighlightStyle`, but it is an editor extension model — heavier to bind to CSS vars; HC needs a bespoke style | Per-language packages, tree-shakeable, but pulls editor core (state/view) for a display-only need | Excellent (viewport virtualization built in) | Good, but it is an **editor**; using it read-only ships an editing engine for a viewer | Active |
| highlight.js | Broad auto-detect coverage, lower fidelity than TextMate (regex heuristics) | CSS-class themes — bindable to vars but coarse token granularity | All-languages bundle is large; subsetting is manual and clumsy | OK | Fine | Active but legacy-feeling |
| Prism | Good coverage, regex-based, lower fidelity on TS/TSX edge cases | CSS-class themes, bindable to vars | Manual language registration; plugin sprawl | OK | Fine | Lower momentum |
| react-syntax-highlighter | Wraps Prism/hljs — inherits their fidelity + bundle problems, adds a React layer | Inherits underlying CSS-class themes | Notoriously heavy; poor tree-shaking | OK | Fine | Thin wrapper, lagging |

**Recommendation: Shiki, fine-grained core (`shiki/core`) + JS regex engine +
per-language/per-theme dynamic import + token theming bound to our OKLCH theme
variables.** It is the only candidate that is simultaneously highest-fidelity
(TextMate grammars = VS Code parity on TS/TSX/Rust), cleanly themable to our
existing token system (theme = data, so high-contrast is a third theme map, not a
hack), and WASM-free under Vite (`createJavaScriptRegexEngine`). The backend byte
cap + a virtualized line renderer cover the large-file path. It also serves the
markdown reader's fenced code blocks through the SAME highlighter — one tokenizer
for both viewers, satisfying the brief's shared-highlighter requirement.

### F6 — Markdown stack for the frontmatter-aware reader

Markdown is a separate concern from highlighting; the reader needs frontmatter
parsing, GFM, double-bracket wiki-link resolution to in-app navigation, and a
code-fence hook into Shiki.

- **Parse + render:** the `unified`/`remark`/`rehype` pipeline (`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-react`) is the standard, tree-shakeable, plugin-driven path; `react-markdown` is the thin component wrapper over the same pipeline. GFM (tables, task-list checkboxes, strikethrough, autolinks) is one plugin (`remark-gfm`) — and task-list items are exactly what the plan checkbox/step structure needs to render readably.
- **Frontmatter:** `.vault/` docs lead with a YAML block (`tags`, `date`, `modified`, `related: [[...]]`). Two options: `remark-frontmatter` to keep it in the tree, or split it off (`gray-matter`-style) and render it through a **dedicated frontmatter header component** rather than as a code block. The IA decision (F7) is to present frontmatter as structured chrome (tags as pills, dates, related as clickable wiki-links), not raw text.
- **Wiki-links:** the double-bracket `stem` and `stem|label` forms are not CommonMark. A small custom remark plugin (or a controlled text-node transform) rewrites them into an in-app link node whose click emits the SAME navigation intent the trees use — resolve the `stem` form to `doc:<stem>` and call `selectNode`, optionally opening the doc in the reader. This reuses the `doc:<stem>` derivation (`engine-model/src/id.rs`), no new identity scheme.
- **Code fences:** a `rehype-react` component override for `<pre><code class="language-*">` delegates to the Shiki highlighter chosen in F5 — one highlighter, both surfaces.
- **Theming:** all reader chrome (headings, blockquotes, tables, pills, code) reads the existing `--color-*` token surface in `frontend/src/styles.css`; no new tokens. Diff-styled blocks (added/removed) honor the sacred diff colors already in the token set.

**Recommendation: `react-markdown` + `remark-gfm` + `remark-frontmatter` (or a
split parse) + a tiny custom wiki-link remark plugin + a Shiki code-fence
component override.** Frontmatter renders through a structured header component,
not as raw YAML.

### F7 — Right-rail IA analysis (from a pure UX standpoint, rebuilt from scratch)

The rail today is the four-tab activity rail (`frontend/src/app/right/RailTabs.tsx:27-37`):
**Inspect** (selection lens, `Inspector.tsx`), **Work** (in-flight pipeline,
`WorkTab.tsx`), **Search** (rag query, `SearchTab.tsx`), **Changes** (git + vault
activity, `ChangesOverview.tsx` + `DiffView.tsx`). The activity-rail ADR
(`2026-06-14-dashboard-activity-rail-adr`) set the **four-tab law**: a surface
earns a standing tab only if it is meaningful without a prior selection AND
answers a distinct operator question; selection-driven detail lives under the tab
that produced the selection; lifted/command surfaces are never tabs.

The brief re-scopes the rail as an **informational overview** ("desktop GUI review
pane", a stable snapshot) and demands the **embedded file-browser / content-browser
be dropped** — but per F1 the right rail never had a file/content browser; the
browsers are the *left* rail. What the brief is really asking for: the right rail
should not become a content browser now that viewers exist — content opens in the
viewer surface, the rail only *links to* it. The viewers (F5/F6) are the natural
home for "open this", so the rail stays a snapshot of links.

Per-section UX interrogation (purpose / does it deserve its own element /
semantically correct & jargon-free):

- **Overview (changed files + diffs):** Purpose — answer "what changed?". N files changed with the diffs to browse. Deserves a standing element: yes (it is the material-evidence pillar, always meaningful). Semantics: "Changes" is the converged-tool idiom and jargon-free. **Keep** as the changes pillar; each changed file cross-links to (a) the real file in the worktree, (b) its `code:<path>` graph node, (c) **open in the code viewer**. The diff body (`DiffView.tsx`) is engine-blocked today; this feature can supply the per-file content the diff needs.
- **Documents edited/changed:** Purpose — answer "which vault docs moved?". Today vault activity is folded into `ChangesOverview.tsx`. UX call: vault-doc changes are a *distinct* operator question from source diffs (intent artifacts vs. code), but a fifth tab violates the law. Resolution: surface changed documents as a **section within the changes/overview pillar**, each row cross-linking to the `doc:<stem>` node AND **opening the markdown reader** — not its own tab.
- **Plan status (finished / in-flight / step counts):** Purpose — answer "what work is in flight?". This is the **Work** pillar (`WorkTab.tsx`, fed by `/pipeline` per `dashboard-pipeline-wire`). Deserves its own element: yes, already a standing tab. Cross-link: each plan/step row opens the plan document in the markdown reader (rendering its wave/phase/step checkbox structure) and focuses the plan's graph node.
- **History:** Purpose — answer "what happened over time?". This overlaps the bottom timeline (already shipped, `dashboard-timeline`) and the `/events` vault-activity feed. UX call: a rail "History" element risks duplicating the timeline. Resolution: keep recent-activity history as a compact list **within the overview pillar** (commits + doc events), deferring the rich temporal view to the existing timeline; do not mint a History tab.
- **Factory/pipeline status:** Purpose — answer "is the pipeline/factory healthy?". This is liveness, belonging to the **Inspect/now** pillar's status rollup, OR to the Work pillar's pipeline arc. UX call: pipeline *health* is liveness (status), pipeline *progress* is Work. Keep health in the status rollup; do not add a Factory tab.
- **Inspect (selection lens):** selection-driven; per the law it stays under its tab, not promoted.
- **Search:** discovery; a distinct standing question; **keep**.

**IA conclusion:** the four-tab law holds — **Inspect, Work, Changes, Search** — and
the re-scope is realized *inside* the Changes tab, recast as an **Overview** pillar:
a stable snapshot of (i) changed source files → diff + code-viewer + node, (ii)
changed/edited documents → markdown-reader + node, (iii) plan status echoed from
Work, (iv) compact recent history (commits + doc events, timeline owns the rich
view). Every row is a cross-link, never inline content. No fifth tab; no embedded
browser. The one open naming question for the ADR: whether to relabel "Changes" →
"Overview" to match the snapshot framing, or keep "Changes" and let the pillar
carry the overview sections. (The activity-rail ADR's `right-rail-tabs-earn-their-place`
candidate is the governing law here.)

### F8 — Cross-linking model (doc/code ↔ graph node ↔ viewer)

Every viewer-bearing surface must offer three jumps, all keyed on the stable ids
already in the contract:

- **To the real file in the worktree:** the repo-relative `path` the trees and the content route already carry.
- **To the graph node:** `doc:<stem>` / `code:<path>` via `node_id` (`engine-model/src/id.rs:84-87`); emit the existing `selectNode` intent (`stores/view/selection`).
- **To open in the viewer:** a new view-store intent ("open document/code at path/id in the viewer surface"), owned by `app/` chrome, fed by a new `stores/` content query — never a rail-local or scene-local fetch (`dashboard-layer-ownership`).

This keeps the viewer a *projection over the one model* (`views-are-projections-of-one-model`):
the content route is a new projection in `engine-query`/`vaultspec-api`, surfaced
by a `stores/` query, consumed by a dumb `app/` viewer component.

## Layer-ownership and rule constraints (binding the design)

- **`dashboard-layer-ownership` / `engine-read-and-infer`:** the content route is read-only (no `.vault/` write, no ref mutation); `stores/` is the sole wire client of it; the viewers are `app/` chrome that fetch nothing directly and read no raw `tiers`.
- **`every-wire-response-carries-the-tiers-block`:** the content route uses `envelope(...)`; a worktree-unreadable scope degrades the structural tier honestly via `degraded_tiers_for`, never a bare 500/empty.
- **`graph-queries-are-bounded-by-default` (generalized to all reads):** the content route is byte-capped (`MAX_CONTENT_BYTES`) with a `truncated` block and optional range cursor; it never serializes an unbounded file.
- **`degradation-is-read-from-tiers-not-guessed-from-errors`:** the viewer's degraded/offline state reads the `tiers` block, not a transport error.
- **`themes-are-oklch-generated-from-a-token-tier` / `warmth-lives-in-tokens-not-decoration`:** both viewers theme only through the existing semantic token tier; Shiki tokens bind to theme variables; no new accent, gradient, or texture.
- **`icons-come-from-the-two-sanctioned-families`:** viewer/rail chrome marks come from Lucide (structural) / Phosphor (domain) only.
- **`right-rail-tabs-earn-their-place` (candidate):** the IA holds the four-tab law; the overview re-scope adds no tab.

## Open questions for the ADR

- Endpoint shape: a dedicated `GET /content?scope=&path=&cursor=` vs. `GET /nodes/{id}/content` (keyed on `doc:`/`code:` ids). The id-keyed form composes better with the cross-link model; the path-keyed form is simpler for arbitrary worktree files. (Lean: id-keyed, with path as the resolution input.)
- Byte ceiling value and whether to range-cursor large files or simply truncate-with-honesty for v1.
- Whether to relabel the "Changes" tab to "Overview".
- Markdown: `react-markdown` wrapper vs. a hand-assembled `unified` pipeline (control vs. weight).
