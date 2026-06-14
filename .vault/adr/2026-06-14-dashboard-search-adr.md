---
tags:
  - '#adr'
  - '#dashboard-search'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-search` adr: `search surface` | (**status:** `accepted`)

## Problem Statement

The dashboard's search experience is pillar 3 of the GUI: a rag-backed query over the
vault and code corpora whose results click through into the graph stage and the right-rail
inspector. The surface exists today as `frontend/src/app/right/SearchTab.tsx` plus its
text-match fallback in `frontend/src/app/right/searchFallback.ts`, built during the GUI
cycle against the prior "paper-warm brand" skin (the `paper-raised`, `paper-sunken`,
`rule`, `ink`, `state-stale` token vocabulary visible in the current markup). The base
design-language ADR has now retired that brand skin in favour of the convergent
agentic-desktop register, and the iconography ADR has fixed the two sanctioned icon
families. The search surface therefore needs a recodified UI/UX spec: what the panel is,
the states it must render, its keyboard and accessibility contract, and how it dresses in
the inherited language — without reopening that language and without changing application
code.

This ADR is spec work. It covers the search UI **surface** only: the `SearchTab` panel
chrome and its fallback presentation. It does not specify the rag query/state/transport
machinery or the rag server lifecycle; those are the rag controller's concern and live in
their own separate ADRs (the `dashboard-rag-search` controller ADR for the
stores-layer query, state, and transport, and the `dashboard-rag-manager` ADR for the rag
server lifecycle). This surface is a consumer of that controller, and the boundary between
them is itself a decision recorded here.

## Considerations

The current form is a single dumb panel. `SearchTab` holds local input state (`query`,
`target`), reads the active scope from the `Stage` context, and delegates all data
concerns to a single hook, `useSearchWithFallback`, in `searchFallback.ts`. That hook in
turn composes two stores-layer queries — `useEngineSearch` (the `/search` pass-through)
and `useVaultTree` (reused for the text-match fallback) — and exposes a flattened
`{ results, semanticOffline, isPending }` shape. The panel renders a search input, a
`vault`/`code` target toggle as a `radiogroup`, a pending line, the
"semantic search offline" notice, and a result list whose rows call `selectNode` with the
result's `node_id`. Rows with a `null` `node_id` are disabled. This is already the correct
shape architecturally; what it lacks is the recodified visual language, the full set of
designed states, and a complete keyboard/a11y contract.

The base language requires: dark-first with light as an equal peer driven by the shared
`:root` OKLCH token tier (no brand `paper-*`/`ink` tokens, no `dark:` variant); colour
spent only on the single muted accent, semantic state, and node/edge type; structure felt
through subtle elevation and soft rounded 1px borders rather than heavy boxes; tabular
numerals on the data-bearing score readout; fast, subtle, state-communicating motion that
goes instant under `prefers-reduced-motion` and never animates keyboard-initiated actions;
compact-but-breathing density; an approachable copy tone in the empty and degraded states;
and the Codex thinking-state liveness cue tied to real in-progress work. The iconography
ADR supplies the chrome marks from Lucide (a search glyph, the per-target and clear
affordances, a status mark for the degraded notice) and reserves Phosphor for the
expressive doc-type marks that annotate results by node species.

The wire contract requires: results arrive already annotated with their engine node id
(foundation reference §8), which is the value-add that makes click-through possible; every
response carries the per-tier `tiers` degradation block (§2), and `semantic.available =
false` is the canonical "rag is down" signal that the surface must render as a designed
state rather than an error; node ids are stable across queries, scopes, and time (§2), so
selection by id is durable. The `/search` endpoint is a transparent pass-through to rag —
the engine adds the node id and the tiers block and otherwise stays read-and-infer.

The boundary versus the rag controller ADRs is load-bearing. The query string, the target,
the typed filter vocabulary, the request transport, the retry/cache policy, the
semantic-versus-fallback decision, and the rag server's running state are all the
controller's domain, surfaced to this panel through stores selectors and the
`useSearchWithFallback` hook (or its controller-owned successor). This ADR specifies what
the panel *renders* and how it *behaves for the operator*; it consumes the controller's
state and emits selection intent, and it decides nothing about how that state is fetched or
how rag is managed.

## Constraints

- **Inherit, do not re-decide.** The base UI language and the iconography selection are
  fixed by their ADRs and are treated as settled parents. This surface introduces no new
  token, no new theme mechanism, no new icon family, and no motion grammar of its own; it
  consumes the shared `:root` tier and the two sanctioned icon families. The current
  brand-skin token names in the markup (`paper-raised`, `paper-sunken`, `rule`,
  `rule-strong`, `ink`, `ink-muted`, `ink-faint`, `state-stale`) are superseded by the
  semantic OKLCH tier during adoption; this ADR records the requirement, not the rename.
- **Never fetches directly.** The panel lives in `frontend/src/app/` (app chrome) and must
  not call `fetch`, must not read the raw `tiers` block, and must not speak to the engine
  or to rag. It consumes the rag controller exclusively through stores selectors/hooks and
  emits selection intent through the view store's `selectNode`. This is the
  dashboard-layer-ownership boundary and the views-are-projections rule applied to search:
  the search result list is a projection over the one model, reached by node id.
- **Degradation is a designed state, not an error.** When the `semantic` tier is absent,
  the surface renders an explicit, calm "semantic search offline" affordance and the
  text-match fallback — never an error toast, never a dead or disabled control, never a
  spinner that never resolves. A `401` (stale token) is likewise a designed reconnect
  state owned upstream, not a search error.
- **State isolation.** The panel's local input state must not bleed across scope changes
  in a way that shows one scope's results under another; result identity is by stable node
  id so cross-scope and time-travel selection stay honest. The surface holds only ephemeral
  view state (the query text, the target, transient focus); all durable and shared state
  lives in the controller and the view store.
- **What it must NOT do.** It must not define its own result or node shape, must not own
  the rag filter vocabulary (it renders the engine-enumerated vocabulary the controller
  supplies), must not own the rag lifecycle or offer a "start rag" verb (that is the rag
  manager surface), must not paginate or rank server-side, and must not persist search
  history or queries to the engine (no vault writes transit any surface).
- **Parent stability.** The base language and iconography ADRs are accepted and stable; the
  foundation reference §8/§2 contract has shipped and is exercised by the live `/search`
  pass-through. The one genuine dependency risk is timing: the `dashboard-rag-search` and
  `dashboard-rag-manager` controller ADRs are being authored in the same cycle, so the
  exact selector names this surface consumes are settled there; this ADR specifies the
  surface against the contract the controller must satisfy, not against a frozen API.

## Implementation

**Scope.** The recodified `SearchTab` panel and its fallback presentation: the query
input, the typed filter chips, the result list with node-id click-through, and the full
state machine — all dressed in the inherited base language and icon families. The panel
remains a dumb view: local ephemeral input state plus rendering of controller state,
nothing more.

**Query input.** A single search field is the panel's primary affordance, carrying a
Lucide search glyph as a leading adornment and a clear affordance (a Lucide close mark)
that appears once the field is non-empty. It uses the native `search` input type, carries
an accessible label, and dresses in the semantic surface/border tier with the accent
focus ring from the 12-step role model (the discrete focus state the new tier supplies).
Typing drives the controller's query; the surface does not debounce or transport — that is
the controller's policy. The placeholder copy stays approachable and instrument-grade.

**Typed filter chips.** The `vault`/`code` target toggle and rag's filter vocabulary are
presented as typed chips. The chip *vocabulary is engine-enumerated* — the surface renders
exactly the filter facets the controller exposes from rag's forwarded filter grammar
(target, doc-type, language, feature, date, and the rest), never a hard-coded list — and
emits chip toggles back to the controller as filter intent. Chips are rounded, low-chroma,
restrained; an active chip is marked by the accent and by `aria-pressed`/`aria-checked`,
not by colour alone, preserving grayscale-safe state. The target selector stays a
`radiogroup`; multi-select facets are toggle chips. Chip removal and addition are
keyboard-initiated and therefore instant (no animation), per the motion law.

**Result list and click-through.** Results render as a vertical list, each row showing the
source identity (stem or path[#symbol]), an optional excerpt, a doc-type/species mark from
Phosphor when the result maps to a known node species, and the relevance score as a
right-aligned tabular-numeral percentage. The row's whole surface is the click target;
activating it calls the view store's `selectNode` with the result's `node_id`, which
focuses the node on the stage and drives the inspector through the existing shared-selection
path — the surface emits intent and never navigates itself. A result whose `node_id` is
`null` (no graph node maps to it) is rendered visibly non-clickable with an accessible
explanation rather than silently dead; it may still be read. Object constancy is preserved
by keying rows on stable identity (node id where present), so re-query and live re-rank do
not thrash the list. Selection follows the focus-everywhere model: a selected result is
reflected wherever that node id appears.

**The states.** The panel is an explicit state machine, each state a designed surface:

- *Idle / empty.* No query yet: a calm, approachable prompt explaining what search does
  (semantic over vault and code, click a result to focus it on the stage), in the
  empty-state copy tone the base language sanctions — not a blank panel.
- *Loading.* A query is in flight: the purposeful liveness cue (the sanctioned Codex
  thinking-state micro-interaction) tied to the controller's real pending state, short and
  subtle, replaced instantly by results. Under `prefers-reduced-motion` it is a static
  in-progress label, not an animation.
- *Results.* The list as above, with a quiet result-count summary so the operator can scan
  the receipt of the query.
- *No results.* A query returned nothing: an honest, non-alarming empty result message that
  suggests broadening the query or relaxing chips — distinct from idle and from degraded.
- *Degraded (semantic search offline).* The `semantic` tier is absent: an explicit, calm
  notice carrying a Lucide status mark and approachable copy ("semantic search offline —
  showing title and text matches"), styled as a neutral/advisory state (not error red),
  followed by the text-match fallback list. Fallback rows are marked as text matches (a
  small "text match" tag) and their scores sit in a visibly lower band so a fallback hit
  never masquerades as semantic certainty. For the `code` target, where no text fallback
  exists, the notice states that plainly rather than rendering an empty list as failure.
  This is the degradation matrix row operationalized, and it is a designed state, never an
  error.
- *Error.* A genuine request failure that is *not* tier degradation (a transport error the
  controller surfaces as such) renders a recoverable, plainly-worded message with a retry
  affordance — kept distinct from the degraded state, because "a backend is down" and "your
  request failed" must read differently per the tiers contract.

**Keyboard contract and accessibility.** The field is reachable and focusable in tab
order; `/` or the command-palette route focuses it (the palette entry is owned elsewhere,
this surface just accepts focus). Arrow keys move through results as a managed list
(roving tabindex), Enter activates the focused result (calling `selectNode`), and Escape
clears the query or returns focus to the field. Because result activation is
keyboard-initiated, the resulting stage focus is instant, not animated. The result list is
an accessible list with each row a button carrying its source and score in its accessible
name; the score percentage uses tabular numerals. State transitions are announced through a
polite live region: the result count on settle, the "semantic search offline" notice on
degradation, and the no-results message — so a screen-reader operator learns the outcome
without polling. Active chips and the selected result expose their state through ARIA, not
through colour alone, satisfying the grayscale-safe identity gate. All motion respects
`prefers-reduced-motion`.

**Layer ownership and projection.** The panel is app chrome: it imports stores selectors
(the rag controller's query state, the enumerated filter vocabulary, the degradation
truth) and the view store's `selectNode`, and imports nothing from the engine client or
rag. It reads `tiers` only through the controller's already-interpreted `semanticOffline`
(or successor) selector, never the raw block. Each result is a projection over the one
model addressed by its stable node id; clicking a result is selection of that model node,
which every other view (stage, inspector, browser) reflects through the shared selection —
the search list adds no model and no second source of truth, exactly the
views-are-projections discipline. The fallback's pure matcher (`buildFallbackResults`)
stays a unit-tested pure function over the cached tree; its presentation is what this ADR
recodifies.

**Styling.** Apply the base tokens (semantic OKLCH surface/border/accent tier, the 12-step
hover/pressed/focus states), the compact-but-breathing density and consistent radius, the
fast/subtle motion grammar with reduced-motion fallback, the Lucide chrome marks and
Phosphor species marks, and tabular numerals on the score. No brand `paper-*`/`ink`
tokens, no second accent, no gradient, no texture — warmth lives only in the neutrals'
hue, the single accent, soft depth, the liveness cue, and the copy tone, and yields to
contrast and legibility on any conflict.

## Rationale

The surface is already correctly shaped — a dumb panel over a single controller hook,
emitting selection by stable node id — so this ADR's work is recodification, not
re-architecture, which is exactly what the base-language pivot calls for: a token, icon,
state, and a11y refresh layered onto an unchanged ownership map. Inheriting the base
language and icons wholesale (re-deciding nothing) keeps the search panel a native member
of the agentic-desktop cohort and consistent with every other surface for free through the
shared `:root` tier, the cohort grammar the design-language research found converging.

Rendering rag-down as a designed "semantic search offline" state with a text-match
fallback, rather than an error, is the direct application of the foundation reference's
truthfulness mechanism (§2) and the GUI ADR's degradation matrix: the operator keeps a
working control and an honest account of what is and isn't available, which is the whole
point of the per-tier `tiers` block. Drawing the surface/controller boundary explicitly —
this panel consumes the rag controller and never fetches — honours dashboard-layer-ownership
and keeps the single-wire-client invariant intact, so the search surface cannot become a
second place that touches rag. Addressing results by stable node id makes click-through a
projection over the one model rather than a parallel navigation system, satisfying
views-are-projections and giving cross-region selection consistency at no extra cost.

## Consequences

- **Gains.** A search panel that reads native to the cohort and shares the dashboard's
  theme, density, and a11y contract for free; a complete, designed state machine
  (including the previously thin idle/no-results/error states) so the surface never shows a
  raw or dead control; an explicit, calm degradation experience that keeps search usable
  when rag is down; a clean surface/controller boundary that future rag work can evolve
  behind without touching the panel.
- **Costs and difficulties.** The recodification touches every styled element in
  `SearchTab.tsx` and the fallback notice, swapping brand tokens for the semantic tier and
  wiring the two icon families — real adoption work, deferred to the implementation cycle.
  The enumerated filter-chip vocabulary depends on the controller exposing rag's filter
  grammar as a selector; until that lands the panel can ship the target toggle and grow
  chips incrementally. The polite-live-region announcements and roving-tabindex list are
  new a11y machinery to build and test.
- **Risks.** The chief risk is the surface drifting back into touching the wire — adding a
  `fetch` or reading raw `tiers` "to make a filter work" — which the layer-ownership rule
  exists to prevent; the spec keeps the panel a pure consumer to forestall it. A second
  risk is the degraded state being mistaken for an error during styling (red-coding it),
  which would make the GUI lie about availability; the state machine separates degraded
  from error deliberately. A third is the controller ADRs settling selector names
  differently than assumed here; the surface is specified against the contract those ADRs
  must satisfy, not against frozen names, to absorb that.
- **Pathways opened.** A complete state machine and a11y contract give a reusable template
  for other result-list surfaces (command-palette results, neighbour lists); the
  enumerated-chip pattern generalizes to any engine-enumerated facet UI; and the clean
  consumer boundary lets the rag controller and rag manager evolve (new filters, new
  lifecycle states) with the panel adapting through selectors alone.

## Codification candidates

- **Rule slug:** `search-results-click-through-by-stable-node-id`.
  **Rule:** Every search-result surface routes click-through by selecting the engine
  node id the result carries (emitting `selectNode` into the view store), never by a
  surface-local navigation path or a re-fetch — the result list is a projection over the
  one model. (Candidate; promote only after it has held across one full execution cycle.)
