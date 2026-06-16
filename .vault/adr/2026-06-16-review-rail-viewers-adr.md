---
tags:
  - '#adr'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-review-rail-viewers-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
  - "[[2026-06-14-dashboard-code-tree-adr]]"
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
---

# `review-rail-viewers` adr: `document + code viewers, content endpoint, right-rail overview IA` | (**status:** `accepted`)

## Problem Statement

The dashboard can navigate to documents and code but cannot **read** them. Clicking
a vault doc or a code file in the left rail only selects a graph node
(`browserSelection.ts:28-31` / `79-84`); there is no markdown reader, no code
viewer, and `frontend/package.json` carries no rendering library at all
(research F1). This leaves a headline gap: the operator can find an ADR, a plan, an
exec record, or a source file, but the application has no way to display its
contents. Three intertwined surfaces close that gap and re-scope the rail around
them:

1. A **frontmatter-aware Markdown reader** (display-only) for `.vault/` documents
   (typed bodies for adr/plan/exec/research/audit/index, with YAML frontmatter
   `tags`/`date`/`modified`/`related: [[wiki-links]]`) and general markdown:
   parse frontmatter as structured chrome, render GFM, resolve double-bracket
   wiki-link syntax to in-app navigation, render plan checkbox/step and exec/adr
   structure readably,
   and render fenced code through the SAME highlighter as (2).
2. A **read-only, syntax-highlighted code-file viewer** (a review surface, not an
   editor or repo browser) covering Python, Rust, JS, TS, JSX/TSX, Bash/batch,
   PowerShell, C, C++, JSON, TOML, YAML, Markdown, and the long tail.
3. The **right rail re-scoped as an informational overview** — a stable snapshot of
   what changed, which documents moved, plan status, recent history, and pipeline
   health, where **every item cross-links** to the real file, its graph node,
   and/or opens it in the viewer.

Both viewers require a backend the engine does not yet have: a bounded, read-only
**content-fetch** endpoint that serves document/file bytes. The contract reserved
exactly this as a deliberate future rev (§11 W1) and the code-tree ADR explicitly
deferred content preview to it (research F2, F3). This ADR decides the markdown
stack, the code highlighter, the content endpoint, the rail IA, and the
cross-linking model. It is spec work and authorizes no implementation beyond what
the sibling plan structures.

## Considerations

- **This is the reserved content rev, not scope creep.** Foundation §11 W1 requests
  "cursor-paginated full content (which would also serve search-result previews)"
  and notes "full content paging is heavier and should ride a deliberate rev"; the
  code-tree ADR defers "content preview ... rides the foundation §9/§W1
  evidence-excerpt rev." This feature is that rev (research F3).
- **The backend is almost entirely reuse.** The body reader exists
  (`reader.rs:42-77`, `DocumentBody{path,text,blob_hash}`) but is wired to no route
  (research F2). Scope resolution (`registry.rs:579-605`), path-traversal safety
  (`file_tree.rs:110-127` `resolve_within_root`), the shared envelope/tiers
  (`routes/mod.rs:90-98`, `24-85`), bounding (`MAX_GRAPH_NODES`,
  `MAX_LEVEL_CHILDREN`, the `truncated` block), and stable ids (`id.rs:84-87`) are
  all settled and directly reusable (research F4).
- **One highlighter, two surfaces.** The reader's code fences and the code viewer
  must share a tokenizer (brief requirement). The choice must theme to our OKLCH
  light/dark/high-contrast tokens, lazy-load grammars, stay light in the bundle,
  and fit Vite/SSR.
- **The rail already has a four-tab law.** The activity-rail ADR fixed
  Inspect/Work/Changes/Search and a scarcity discipline (a surface earns a tab only
  if standing AND a distinct question; selection-driven detail and lifted surfaces
  never get tabs). The re-scope must honor that law, not mint a fifth tab.
- **There is no file/content browser in the right rail to remove.** The browsers are
  the *left* rail; the right rail's "Changes" pillar shows activity, not content
  (research F1, F7). The brief's "drop the embedded browser" intent is realized as:
  the rail never inlines content — it links out to the viewers.
- **Layer ownership is fixed.** The content route is engine read-and-infer; `stores/`
  is its sole client; the viewers and the rail are `app/` chrome that fetch nothing
  and read no raw `tiers`.

## Constraints

- **Read-only, no mutation (`engine-read-and-infer`).** The content route reads bytes
  from the worktree (`read_from_worktree`) or a committed ref (`read_from_ref`); it
  never writes `.vault/`, never mutates refs, and grows no sibling semantics.
- **Every read is bounded (`graph-queries-are-bounded-by-default`, generalized).** A
  new `MAX_CONTENT_BYTES` ceiling caps the served body, with a `truncated` honesty
  block mirroring `/graph/query` and `/file-tree`. v1 truncates-with-honesty; an
  optional byte/line range cursor is the bounded descent path for very large files.
- **Every response carries tiers through the shared helper
  (`every-wire-response-carries-the-tiers-block`).** The route returns
  `envelope(data, tiers, next_cursor)`; a non-readable worktree (e.g. a remote-ref
  scope with no working tree, or an unreadable path) degrades the **structural** tier
  via `degraded_tiers_for`, never a bare 500 or a healthy-looking empty. A
  path-traversal or non-existent path is a tiered 400, distinct from degradation.
- **Layer ownership (`dashboard-layer-ownership`, `views-are-projections-of-one-model`).**
  The route is a new projection in `vaultspec-api`/`engine-query`; a new `stores/`
  query is its sole client and reads the `tiers` block; the markdown reader, the code
  viewer, and the rail are dumb `app/` views that subscribe and emit open/select
  intent. No view `fetch`es; no new node-identity scheme (reuse `doc:<stem>` /
  `code:<path>`).
- **Theming (`themes-are-oklch-generated-from-a-token-tier`,
  `warmth-lives-in-tokens-not-decoration`).** Both viewers theme only through the
  existing semantic token tier in `styles.css`; the highlighter binds tokens to theme
  variables so light/dark/high-contrast are three token maps, not bespoke CSS; no new
  accent, gradient, or texture. Diff-styled content honors the sacred diff colors.
- **Icons (`icons-come-from-the-two-sanctioned-families`).** Viewer/rail chrome marks
  are Lucide (structural) / Phosphor (domain) only.
- **Parent stability.** Depends on the settled structural-tier worktree index, the
  stable-id derivation, the shared envelope, and the four-tab rail — all shipped and
  scale-hardened. The one **frontier-ish** element is the highlighter integration; it
  is a mature, widely-deployed library (Shiki) within the implementing model's
  knowledge, so it is low risk. No engine frontier work.

## Implementation

**The content endpoint (engine).** A new read-only `GET /nodes/{id}/content` keyed on
the stable node id (`doc:<stem>` / `code:<path>`) — the id-keyed form composes with
the cross-link model and reuses the identity scheme the trees, graph, and search
already share. It resolves the id to a repo-relative path, validates the scope to a
worktree root (`validate_scope_token`), guards traversal (`resolve_within_root`
semantics), reads bytes (`read_from_worktree`, or `read_from_ref` for a ref-only
scope), and returns through the shared `envelope(...)`:
`{path, blob_hash, byte_len, language_hint, text, truncated?}`. It is byte-capped by
a new `MAX_CONTENT_BYTES` constant (mirroring the existing ceilings) with a
`truncated` block when exceeded; an optional `?range=` / `?cursor=` parameter is the
bounded descent for large files. `language_hint` is derived from the path extension
so the client picks the grammar without re-parsing. Tiers: success carries the live
per-scope block; an unreadable worktree degrades **structural** honestly. The route
is bearer-gated by the existing middleware and rides the existing 1 MiB request-body
ceiling. `/vault-tree` and `/file-tree` stay metadata-only — content lives only on
this route.

**The stores layer.** A new content query in `frontend/src/stores/` is the sole wire
client of `/nodes/{id}/content`: keyed by `{scope, nodeId}` (the `blob_hash` makes
the response content-addressable and cache-stable), with an explicit `gcTime` and a
bounded cache (per `bounded-by-default-for-every-accumulator` — the viewer must not
retain every opened doc's bytes for the session). It exposes a selector that reads the
`tiers` block so the viewers derive degraded/offline state from tiers, never from a
transport error (`degradation-is-read-from-tiers-not-guessed-from-errors`). A small
view-store intent ("open `{nodeId}` in the viewer") drives which document/file the
viewer surface shows.

**The code highlighter (shared).** **Shiki**, fine-grained (`shiki/core`
`createHighlighterCore`) with the **JavaScript regex engine**
(`createJavaScriptRegexEngine`, no Oniguruma WASM — clean Vite build, SSR-safe), and
**per-language / per-theme dynamic `import()`** (`@shikijs/langs/*`,
`@shikijs/themes/*`) so only grammars the operator actually opens are loaded.
Tokenization runs to HAST for React rendering. Theming binds Shiki tokens to our OKLCH
theme variables (either a `css-variables` theme or dual-theme `defaultColor:false`
emitting `--shiki-*` spans remapped onto our `--color-*` surface), so light/dark/
high-contrast are three token maps with no per-component color. A thin
`useHighlighter` hook owns the singleton highlighter and lazy grammar registration;
the same hook serves the markdown reader's code fences (one tokenizer, both surfaces).

**The markdown reader (`app/`).** `react-markdown` over the `unified`
remark/rehype pipeline with `remark-gfm` (tables, task-list checkboxes, strikethrough,
autolinks — the plan checkbox/step structure renders as native task items) and
frontmatter handling. The leading YAML block renders through a **dedicated frontmatter
header component** — `tags` as pills, `date`/`modified` as stamps, `related` as
clickable wiki-links — never as raw text. A small custom remark plugin rewrites
the `stem` and `stem|label` double-bracket wiki-link forms into in-app link nodes
that resolve to `doc:<stem>` and emit the navigation intent the trees use (open in
the reader and/or focus the node).
A `rehype-react` component override routes fenced code to the shared Shiki hook. All
chrome (headings, blockquotes, tables, code, pills) reads the existing `--color-*`
tokens; ADR/exec/plan typed bodies render through GFM with no special-casing beyond
the task-list and frontmatter affordances.

**The code viewer (`app/`).** A dumb component that takes a `{path, text,
language_hint}` from the stores query, picks the grammar via the shared hook, and
renders highlighted lines with line numbers, monospace path identity in a header, and a
virtualized line list so a large (capped) file scrolls cheaply. It is display-only — no
editing affordances, no repo navigation; "open another file" is a new intent, not an
in-viewer browser. Degraded/empty/error states read from the `tiers` selector.

**The right-rail overview IA.** The four-tab law holds: **Inspect, Work, Changes,
Search**. The re-scope lands *inside* the Changes tab, recast as an **Overview**
pillar that is a stable snapshot, not a content browser:

- **Changed source files** → each row cross-links to the worktree path, the
  `code:<path>` node (`selectNode`), and **opens the code viewer**; the long-blocked
  per-file diff body (`DiffView.tsx`, engine-blocked today) is fed by the new content
  route.
- **Changed/edited documents** → each row cross-links to the `doc:<stem>` node and
  **opens the markdown reader**; surfaced as a section within the pillar, not a fifth
  tab.
- **Plan status** (finished / in-flight / step counts) stays the **Work** pillar
  (`WorkTab.tsx` over `/pipeline`); plan/step rows open the plan in the reader and
  focus its node.
- **Recent history** (commits + doc events) is a compact list within the overview; the
  rich temporal view stays the already-shipped bottom timeline — no History tab.
- **Pipeline/factory health** stays liveness in the status rollup; pipeline *progress*
  stays Work — no Factory tab.

The "Changes" tab MAY be relabelled "Overview" to match the snapshot framing; the
label is a UX nicety, the pillar composition is the decision.

**The cross-linking model.** Every viewer-bearing row offers three jumps, all on
stable contract ids: to the worktree path; to the graph node (`doc:<stem>` /
`code:<path>` via `node_id`, emitting `selectNode`); and to open in the viewer (a new
view-store intent fed by the stores content query). The viewer is thus a projection
over the one model — a new `engine-query`/`vaultspec-api` projection, a `stores/`
query, dumb `app/` views.

## Rationale

**Shiki** is chosen because it is uniquely the intersection the brief demands
(research F5): TextMate grammars give VS Code-grade fidelity on the hard targets
(TS/TSX, Rust, PowerShell) where regex-based highlighters (highlight.js, Prism, and
the `react-syntax-highlighter` wrapper over them) lose accuracy; theme-as-data binds
cleanly to our OKLCH token tier so high-contrast is a third theme map rather than a
bespoke stylesheet; fine-grained `createHighlighterCore` + dynamic grammar/theme
imports keep the bundle proportional to what is opened; and the JavaScript regex
engine removes the Oniguruma WASM, giving a clean Vite build and SSR safety.
CodeMirror 6 read-only was rejected because it is an **editor** — using it for a
display-only viewer ships an editing engine and a heavier theming model for no benefit;
highlight.js/Prism were rejected on fidelity and bundle/subsetting ergonomics;
`react-syntax-highlighter` inherits both problems plus lag. Serving the markdown
reader's fences through the same Shiki hook satisfies the one-highlighter requirement
directly.

The **markdown stack** (`react-markdown` + `remark-gfm` + frontmatter + custom
wiki-link plugin + Shiki fence override) is the standard, tree-shakeable, plugin-driven
path; rendering frontmatter as structured chrome and wiki-links as in-app navigation is
what makes the reader *vaultspec-aware* rather than a generic markdown box, and it
reuses the `doc:<stem>` identity scheme rather than inventing one.

The **content endpoint** lands as the reserved §11 W1 / code-tree rev, keyed on the
stable node id so it composes with the cross-link model, and assembled from settled
primitives (scope validation, traversal guard, body reader, shared envelope, bounding)
— so it is additive to the contract and carries no engine frontier risk (research F2,
F3, F4). The **rail IA** holds the activity-rail ADR's four-tab law: the re-scope is a
recomposition of the Changes pillar into an Overview snapshot of cross-links, adding no
tab, removing nothing the operator depends on, and finally unblocking the diff body via
the content route (research F7, F8).

## Consequences

- **Gain.** The dashboard becomes a genuine review instrument: an operator can open and
  read any vault document (with structured frontmatter and live wiki-links) or any
  source file (VS Code-grade highlighting) one click from the graph, the trees, search,
  or the rail — closing the headline read gap.
- **Gain.** The long-blocked git diff body is unblocked: the content route supplies the
  per-file bytes `DiffView.tsx` has been rendering "capability pending" for.
- **Gain.** One highlighter serves both surfaces; one content route serves both
  viewers, search-result previews (the §11 W1 dividend), and the diff.
- **Cost.** Shiki + the remark pipeline add real bundle weight; the fine-grained
  core + lazy grammar/theme imports keep it proportional, but the lazy-load grammar
  state and the per-scope content cache are more moving parts than the metadata trees,
  and the cache must be bounded at creation (`bounded-by-default-for-every-accumulator`).
- **Cost / pitfall avoided.** The standing temptation the code-tree ADR named — inlining
  content "because the bytes are right there" — is resisted at the rail: the rail links
  to the viewers, it does not embed them. The viewers are the one content home.
- **Difficulty.** Theme-binding Shiki tokens to OKLCH variables across three themes,
  and getting the scene/DOM theme switch to repaint highlighted code without a reflow,
  needs care; the dual-theme/CSS-variable approach is the mitigation.
- **Pathway.** A bounded content route makes future content facets cheap: search-result
  previews, evidence excerpts returning to inspector scope (§11 W1), symbol-anchored
  scroll (`code:<path>#<symbol>` nodes already exist), and a "reveal/open" action from
  any node.

## Codification candidates

- **Rule slug:** `content-fetch-is-the-one-viewer-backend`.
  **Rule:** Document and code file bytes reach the GUI through exactly one bounded,
  read-only, enveloped engine content route consumed solely by `frontend/src/stores/`;
  metadata/listing routes (`/vault-tree`, `/file-tree`) stay byte-free, and no `app/`
  or `scene/` surface fetches or inlines file content — it opens the shared viewer.
  (Candidate only — promote after the boundary has held across at least one full cycle,
  per the codify discipline; first encounter is not yet a rule.)
- **Rule slug:** `one-highlighter-themed-from-the-token-tier`.
  **Rule:** All syntax highlighting (the code viewer and the markdown reader's fences)
  goes through one shared highlighter whose token colors bind to the OKLCH semantic
  token tier, so a theme — including high-contrast — is a token map, never a
  per-surface or per-language stylesheet. (Candidate only — same first-encounter
  caveat.)
- Note: the right-rail four-tab law is already a standing candidate
  (`right-rail-tabs-earn-their-place`, from the activity-rail ADR); this ADR exercises
  it without minting a fifth tab, which is evidence toward that promotion rather than a
  new candidate.
