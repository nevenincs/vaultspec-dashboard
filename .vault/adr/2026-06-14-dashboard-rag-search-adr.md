---
tags:
  - '#adr'
  - '#dashboard-rag-search'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `dashboard-rag-search` adr: `rag search controller` | (**status:** `accepted`)

## Problem Statement

The dashboard's search surface is the third product pillar: a developer types a phrase
and gets ranked vault and code hits that click straight through into the graph stage.
The visible search UI is one thing; the thing this ADR pins is the layer beneath it —
the stores-layer controller that issues the engine's `/search` rag pass-through, holds
the results and the engine-enumerated filter vocabulary, annotates each result with its
graph node id, and owns the behaviour when rag is offline. That controller is the sole
wire client for search: it is where the fetch lives, where the degradation truth is
read, and where the text-match fallback is decided. The design-language redefinition is
the trigger for re-pinning every surface, and a controller — which has no pixels of its
own — must still be re-stated against the base language's truthfulness and degradation
laws, because the honesty of what the search UI renders is wholly determined by the
truths this controller exposes.

This ADR is spec work. It codifies the controller's contract, behaviour, and the truths
it must expose so the consuming view renders honestly; it does not plan or perform the
implementation, and it does not redesign the search UI surface (`dashboard-search`) or
the rag server manager (`dashboard-rag-manager`), both of which are separate features.

## Considerations

The decision is grounded in the existing search slice, the engine-GUI contract's §8
search pass-through and §2 degradation truth, and the base design-language laws this
controller must honor without owning a pixel.

- **Current form.** Search is already wired as a thin stores slice plus a fallback hook.
  The query key and hook live in `frontend/src/stores/server/queries.ts`
  (`engineKeys.search`, `useEngineSearch(query, target)`), enabled only when the query is
  non-empty and keyed by `(target, query)`. The transport lives in
  `frontend/src/stores/server/engine.ts` (`EngineClient.search`, posting to `/search`
  with `{query, target?, filters?}`, returning a `SearchResponse` of `results[]` plus the
  `tiers` block; `SearchResult` carries `score`, `source`, optional `excerpt`, and a
  `node_id` that is the engine's value-add). The tolerant live adapter lives in
  `frontend/src/stores/server/liveAdapters.ts` (`adaptSearch` unwraps the nested rag
  envelope `{envelope: {ok, data: {results}}}`, tolerating the rag item vocabulary
  path/stem/source/score/excerpt/text, and `deriveSearchNodeId` recovers a node id along
  the §2 grammar only when the engine annotation is absent — a code hit derives
  `code:{path}`, a vault hit derives `doc:{stem}`, never a guess). The rag-down behaviour
  currently lives in `frontend/src/app/right/searchFallback.ts`
  (`useSearchWithFallback`, `buildFallbackResults`), which on a search error degrades to
  title/text match over the cached vault tree and flags `semanticOffline`.

- **The boundary versus the search UI surface and the rag manager.** The search UI
  (`dashboard-search`) is a dumb view: it renders the controller's results, score/source,
  filter chips, and the degraded-state copy, and it emits intent (query text, target
  toggle, filter selection, result click). It is a consumer of this controller, not a
  second wire client. The rag server manager (`dashboard-rag-manager`) is a different
  concern entirely — it drives rag lifecycle ops through the §6 `/ops/rag/*` proxy and
  owns the manager UI; this controller never starts, stops, or reindexes rag, it only
  reads whether the semantic tier is currently available and reacts. The two share the
  fact of rag's health but own opposite halves of it: the manager acts on rag, the search
  controller reads-and-degrades around it.

- **What the wire contract requires.** Contract §8 makes `/search` a transparent
  pass-through to rag for `vault` and `code` targets with rag's existing filter vocabulary
  forwarded intact, plus exactly one engine value-add — each result annotated with the
  engine node id it maps to so results click through into the graph. §2 requires every
  response, success and error, to carry the per-tier `tiers` degradation block; a rag-down
  `/search` returns a 502 whose error envelope still carries
  `tiers.semantic.available: false`. §4's `/filters` endpoint enumerates the legal,
  data-driven filter vocabulary actually present in scope. These three contract facts —
  pass-through, node-id annotation, tiers-on-every-response — are the controller's whole
  reason to exist as a distinct layer.

## Constraints

- **Stores is the sole wire client (`dashboard-layer-ownership`).** This controller owns
  the search fetch; no view may `fetch /search` itself. A consequence visible today: the
  rag-down fallback hook currently sits under `frontend/src/app/right/`, the chrome
  layer, yet it composes `useEngineSearch` and `useVaultTree` and decides the
  semantic-offline truth — wire-client behaviour living in a view directory. The
  truthful home for that decision is the stores slice; this ADR fixes the controller as a
  stores-layer surface and treats the chrome-resident fallback as a boundary the
  implementation should pull back into stores, leaving the view a dumb consumer of a
  single search selector.

- **`/search` is a transparent pass-through; no search semantics enter the client.**
  The controller forwards the query, target, and rag's own filter vocabulary, and
  surfaces the ranked results as served. It must not re-rank, re-score, synthesize hits,
  or invent filter facets — that is rag's domain and the engine stays read-and-infer
  (`engine-read-and-infer`). The one client-side derivation permitted is recovering a
  node id along the §2 identity grammar when the engine's annotation is genuinely absent;
  that is reconciliation toward the contract, not added semantics.

- **Results carry node ids; click-through is identity-bearing.** Every result the
  controller exposes carries a stable node id (the engine's annotation when present, the
  grammar-derived `doc:{stem}` / `code:{path}` fallback otherwise, or `null` when no
  honest id can be formed). A code hit must never be papered as a `doc:` id — that loses
  the directory and points at no graph node. A `null` id is an honest "not clickable into
  the stage", never a fabricated target.

- **Degradation is tiers-gated truth, not guessed.** The controller's semantic-offline
  state is derived from the §2 `tiers.semantic.available` flag the wire carries (the rag
  502 error envelope, or the success-envelope tier block), not inferred from a bare
  transport error or a timeout. The fallback to text-match is gated on that degradation
  truth so the view renders "semantic search offline" only when the wire says rag is
  down, and the fallback score band stays below semantic certainty so a text match never
  masquerades as a semantic hit.

- **Mock must mirror live wire shape (`mock-mirrors-live-wire-shape`).** The mock engine
  must serve the exact `/search` shape the live serve emits — the nested rag envelope on
  the success path and a 502 carrying `tiers.semantic.available: false` on the rag-down
  path — so `adaptSearch` and the degradation gate are exercised against reality, not a
  convenient internal shape. A captured live sample fed through the same client path is
  the fidelity proof.

- **What it must NOT do.** It must not own a pixel (no rendering), must not drive rag
  lifecycle (that is `dashboard-rag-manager`), must not be duplicated inside a view, must
  not read the raw `tiers` block from any consumer (it interprets the block and exposes
  derived selectors), and must not introduce a new visual primitive — it inherits the base
  language and changes no token, glyph, or motion grammar.

## Implementation

The controller is a stores-layer search slice: a small, typed set of queries and
selectors that consuming views subscribe to, with no pixels of its own. Its "UI/UX
requirements" are the honest truths it must expose so the search view renders correctly.

**Query lifecycle.** The controller issues `/search` through the typed engine client,
keyed by `(target, query)` so vault and code searches cache independently. Issue is
debounced on the keystroke stream so a fast typist does not fan out a request per
character, and the in-flight request for a superseded query is cancelled (the query
client abandons the stale key) so a slow earlier response never overwrites a newer one.
The query is disabled while the input is empty (no request, the idle state). The fetched
results are cached under the query key and invalidated on scope change and on a rag
health transition arriving over the §7 `backends` stream — a rag-came-back transition
must let a previously degraded query re-issue against the live semantic tier rather than
stay pinned to its fallback.

**Filter vocabulary.** The controller holds the engine-enumerated filter vocabulary —
rag's own vocabulary forwarded intact through the pass-through, surfaced to the view as
the data-driven set of legal filter facets (the §4 `/filters` enumeration scoped to the
active worktree, joined with rag's target/filter grammar). The view renders these as
typed chips; nothing is hardcoded. The controller passes the selected filters back into
the `/search` body untouched — it carries the vocabulary, it does not author it.

**Result shape and click-through.** Each result the controller exposes carries score,
source, an optional excerpt, and the stable node id for stage click-through. The node id
is the engine's §8 annotation when present; the tolerant adapter recovers it along the
§2 grammar (`doc:{stem}` for a vault hit, `code:{path}` for a code hit) only when the
annotation is absent, and yields `null` when no honest id can be formed. The view turns
a non-null id into a click that focuses the corresponding graph node (the shared
selection concept) and a null id into a non-clickable result, never a dead link to a
phantom node.

**The rag-down path.** When the wire reports `tiers.semantic.available: false` — a 502
error envelope or a success envelope whose semantic tier is degraded — the controller
enters the semantic-offline state and serves the text-match fallback: a title/feature
match over the already-cached vault tree, scored in a band kept strictly below semantic
certainty so the view can label it as a fallback, not as a confident semantic result.
The fallback is gated on the tiers truth, never on a bare transport error; a vault-target
search degrades to the tree match, a code-target search has no offline corpus and
degrades to an explicit "semantic search offline, no fallback for code" state rather than
a misleading empty result. The fallback control is never dead — it is a designed degraded
state, per the base language's degradation law.

**Caching and invalidation.** Results cache by `(target, query)`; the vault tree the
fallback reuses is the rail's already-cached tree (no second fetch). Invalidation fires
on scope change (a new worktree is a new corpus) and on the §7 `backends` rag-health
transition (so recovery re-issues the live query and a fresh outage swaps to fallback).

**Selectors and intents exposed to the view.** The controller exposes a single search
selector returning the interpreted state — results, the semantic-offline flag, the
pending flag, the error state, and the filter vocabulary — and accepts intent from the
view: set query, set target, set filters, and (indirectly, via the shared selection
store) click a result into the stage. The view reads the interpreted selector; it never
reads the raw `tiers` block, never fetches, and never derives a node id itself.

**The states it models.** The controller models, as explicit interpreted state: `idle`
(empty query, no request), `loading` (a query in flight), `results` (ranked hits served),
`no-results` (a successful search with zero hits — distinct from offline), `semantic-
offline / degraded` (rag down per the tiers block; serving text-match fallback for vault,
an explicit no-fallback note for code), and `error` (a genuine transport or request
failure that still carries the tiers block). Each is a distinct, honest state the view
renders deterministically.

**Layer ownership.** The controller IS the stores-layer wire client for search. It lives
in `frontend/src/stores/`, never in a view; it reads the §2 tiers block and exposes
interpreted selectors so chrome stays dumb. The fallback logic presently in
`frontend/src/app/right/searchFallback.ts` is pulled back into the stores slice so the
view consumes one search selector and the wire-client behaviour has a single home.

## Rationale

The controller earns its place as a distinct layer because the three contract facts that
make search honest — the transparent pass-through, the node-id annotation, and tiers-on-
every-response — all live at the wire boundary, and `dashboard-layer-ownership` already
settles that the wire boundary is the stores layer's exclusive domain. Centralizing the
fetch, the node-id reconciliation, and the degradation gate in one slice is what stops
the `mock-mirrors-live-wire-shape` drift from scattering across every consumer of search,
exactly as the foundation audit's S49 divergence and the 2026-06-13 constellation drift
taught: a single wire client tested against a faithful mock is the only place the
tolerant adapter is exercised against reality.

The tiers-gated degradation is the base design-language's truthfulness law applied to a
behavioural surface: the language pins degradation as a designed state rendered honestly,
and the only way the search view can render "semantic search offline" truthfully is if
the controller derives that state from the wire's `tiers.semantic.available` rather than
guessing from a transport error. The fallback's sub-semantic score band is the same law
in miniature — a text match must never claim semantic certainty. Inheriting the base
language without introducing a visual primitive is correct for a controller: it has no
pixels, so its conformance is entirely a matter of exposing the truths the view needs,
which `views-are-projections-of-one-model` confirms is the right division of labor.

## Consequences

- **Gains.** A single, honest wire client for search, with the fetch, the node-id
  reconciliation, the filter vocabulary, and the degradation gate in one stores slice;
  a view that stays dumb and renders one interpreted selector; degradation that is
  tiers-true rather than guessed; click-through that is identity-bearing and never
  fabricates a node target.
- **Costs and difficulties.** The rag-down fallback presently living in the chrome layer
  must be relocated into the stores slice — a boundary correction, not a feature, but real
  work that touches the view's consumption point. The mock must be held byte-faithful to
  the live `/search` envelope on both the success and 502 paths, an ongoing fidelity
  discipline. The code-target offline case has no fallback corpus and must surface as an
  explicit honest state rather than a misleading empty result.
- **Risks.** A regression that drops the tiers block on the error path would make the
  view lie about availability (the recurring every-wire-response failure); the degradation
  test that asserts the 502 carries `tiers.semantic.available: false` is the guard.
  Deriving a node id too eagerly (papering a code hit as a `doc:` id) points click-through
  at a phantom node; the grammar-strict derivation with a `null` floor is the guard.
- **Pathways opened.** A single search controller gives the eventual command-palette
  search flow and the rail-tab search flow one shared source of truth; the filter-
  vocabulary slice generalizes to any future data-driven search facet; the tiers-gated
  degradation pattern is reusable by every other rag-dependent reader (discovery, future
  semantic features) without re-deriving the honesty law per surface.

## Codification candidates

- **Rule slug:** `degradation-is-read-from-tiers-not-guessed-from-errors`.
  **Rule:** A stores-layer reader's degraded/offline state must be derived from the §2
  `tiers` availability block the wire carries, never inferred from a bare transport error
  or timeout, and any fallback must be gated on that tiers truth. (Candidate; promote only
  after it has held across one full execution cycle — it generalizes the search
  controller's semantic-offline gate to every rag-dependent reader, and may instead fold
  into the existing `every-wire-response-carries-the-tiers-block` rule's consumer-side
  corollary.)
