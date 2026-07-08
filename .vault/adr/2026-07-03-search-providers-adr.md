---
tags:
  - '#adr'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-search-providers-research]]'
  - '[[2026-07-03-rag-integration-hardening-adr]]'
  - '[[2026-06-14-dashboard-rag-search-adr]]'
---

# `search-providers` adr: `one search plane, three providers` | (**status:** `accepted`)

## Problem Statement

Cmd+K search is the dashboard's headline retrieval surface, but it is three
half-related planes with mechanism words on screen: a "semantic search" mode over rag,
a separate literal document finder, and a dead right-rail search pillar. The user-facing
concept should be simply "Search" — one plane a developer types into and gets ranked
hits from every source: meaning matches (rag), code files by name, vault documents by
name — with the binding Figma design (one interleaved species-tagged list, an expanded
reader split) already drawn. The just-accepted rag-integration-hardening ADR made the
semantic source a stable contract; this ADR decides the provider architecture that
composes it with two files sources, the one new wire seam that requires, the plane and
terminology collapse, and what of the designed surface ships now.

## Considerations

- The unified controller already IS a two-provider composition (per-corpus semantic
  controllers behind a pure merge with tiers-gated degradation, bands, bounds, dedupe,
  and a shared freshness epoch) — formalizing the seam is an extraction, not an
  invention. The document finder already narrows a COMPLETE client-cached vault tree,
  satisfying the complete-paginated-set rule as-is.
- No complete code-file listing exists client-side: the file tree is lazy
  per-directory, and the code graph slice is DOI-bounded (5,000-node ceiling) — both
  are forbidden client-narrow sources under the graph and filtering rules. A files
  (code) provider therefore needs one new bounded engine projection.
- The binding design (`SearchPaletteSurface.list` / `.expanded` / `.expanded.doc`,
  `SearchResultPill`) encodes the answers to the UI questions: ONE ranked interleaved
  list (not provider sections), species eyebrows in plain words (doc-type names,
  "Code", "Change") on scene category tokens, selected = sunken + accent border, a
  results counter, a Kbd legend, and an expanded split with a species-appropriate
  reader pane. No rag/semantic vocabulary appears anywhere in the design.
- Governing rules bind the shape: the actions rule (palette commands from the one
  provider registry; corpus navigation stays the document-search plane; one
  `openEntityAction`), labels-are-user-facing (internal vocabulary never on pixels),
  view-rewrite-freezes-the-contract (chrome keeps consuming stores hooks and the
  activation seam unchanged), engine read-and-infer, bounded reads everywhere, and
  no-deprecation-bridges (dead planes are deleted, not shimmed).
- A "Change" (commit) species is designed but not mandated; the seam must admit it
  later without re-architecture.

## Considered options

- **O1 — Client-composed provider seam over per-source readers (chosen).** A
  `SearchProvider` contract in the stores layer composing semantic + files(vault) +
  files(code); merge/rank/degradation machinery lifted from the existing unified
  controller. Matches the command plane's registry pattern and keeps the engine
  read-and-infer.
- **O2 — An engine-side multi-provider search route.** One request, but it moves
  composition semantics into the engine (read-and-infer breach for the two purely
  structural sources), couples the palette to a new bespoke wire shape, and re-fetches
  listings the client already caches. Rejected.
- **O3 — files(code) over a recursive `/file-tree` walk.** N round-trips per palette
  open, and hits on non-graph files would point at absent nodes. Rejected.
- **O4 — Sectioned-by-provider result list.** Contradicts the binding design's single
  interleaved ranking. Rejected.

## Constraints

- **Parent stability.** Depends on shipped, just-audited seams: the hardened flat
  `/search` contract with freshness fields, the unified controller machinery, the
  complete `vault-tree` walk, `activateEntity`, the keymap registry, and the
  files-only code graph (every admitted source file mints exactly one `code:{path}`
  node). No frontier risk.
- **The `/code-files` route is a deliberate contract event** — a new stores reader +
  query key, reviewed as such. It projects the `LinkageGraph` directly (never the
  DOI-bounded graph projection), is memoized on the graph `generation`, cursor-
  paginated, and carries an honest `truncated` block when the ingest walk cap was
  reached.
- **Rank-band honesty.** Literal name matches must never masquerade as semantic
  certainty NOR be buried by it: bands are explicit and deterministic (below), and a
  hit found by both meaning and name renders once at its best rank.
- **Degraded-copy honesty survives rewording**: the plain-language degraded state must
  still say (1) the fuller mode is down and (2) the shown results are name/text
  matches only.
- **Keyboard model unchanged**: the single combobox input with a manual cursor stays;
  no FocusZone enters the palette.

## Implementation

Five decisions.

**D1 — The `SearchProvider` seam.** A provider contract in
`frontend/src/stores/server/` (mirroring the command plane's registry pattern): each
provider is a hook-shaped source `(query, scope) → { id, entries, state }` where
entries carry the species, title, why-line, feature tag, node id, and a score in the
provider's band. The host `useSearchProviders(query, scope)` owns what is shared —
debounce, per-source cache keys, tiers-gated degradation, the interpret state machine,
score-desc merge with identity dedupe (best rank wins), the 40-item bound, and the
shared semantic epoch — all lifted from the existing unified controller, whose
machinery is reused verbatim where possible. Three providers register: **semantic**
(today's vault+code `/search` pair, unchanged wire), **files (vault)** (the existing
complete vault-tree matcher, generalized to also match titles), **files (code)** (the
new `/code-files` reader below + the same matcher). The literal matcher becomes ONE
shared utility (today's two near-duplicate scanners collapse into it).

**D2 — Rank bands.** Semantic hits keep rag's normalized score (0..1). Literal hits
map into two explicit bands: strong-literal (exact stem/filename or prefix match)
0.70–0.95, weak-literal (substring) 0.20–0.50. The existing rag-down text fallback
folds into the files(vault) provider (one literal matcher, one band policy) — the
degraded state is simply "the semantic provider is down; the files providers still
serve," which the design's interleaved list renders without a mode switch. Dedupe by
node identity keeps the higher-scored entry.

**D3 — One plane, plain words, dead pillar deleted.** Mod+P opens "Search" running
all providers; every rendered string is plain language: the idle prompt drops "by
meaning", the degraded StateBlock becomes "Full search is unavailable — showing name
matches only." (sr-only twin matches). Mod+Shift+O remains as the focused
document-finder plane (corpus navigation home per the actions rule) but becomes a thin
consumer of the files(vault) provider — one matcher implementation, two surfaces. The
vestigial right-rail search pillar is DELETED: the "search" panel tab entry, the
focus-search command and keybinding, and the unmounted presentation-view derivations
go; the palette is the one search home. The rag operations console keeps its ops
vocabulary (sanctioned exception).

**D4 — Ship the `.list` state now; the reader split is a follow-on.** This feature
delivers the compact designed list: species-tagged interleaved pills (eyebrow in
doc-type words / "Code" on scene category tokens, title, why-line, feature chip,
selected = sunken + accent border), the "N results" header counter, and the Kbd
legend footer. The expanded list+reader split (652:1804 / 666:2038) requires content
readers (markdown body, code excerpt) and is recorded as the immediate follow-on
feature over this seam — not silently dropped, not half-built.

**D5 — Species vocabulary and the reserved Change provider.** The pill species is
derived from the entry's identity: vault hits show their doc-type word, code hits
show "Code" in mono title styling. The species enum and provider contract explicitly
admit a future "Change" (commit) provider — designed already — as a registration,
not a re-architecture.

## Rationale

The provider seam formalizes structure that already exists and is already tested: the
unified controller's merge, bands, degradation gating, and bounds carry over, so the
risk concentrates in the one genuinely new element — the `/code-files` projection —
which is deliberately shaped as a twin of the proven `vault-tree` walk (complete,
cursor-paginated, generation-memoized, truncation-honest) rather than a novel search
capability. Composition stays client-side because two of three providers are pure
narrows over complete client-cached listings and the third is the existing search
wire; the engine gains no search semantics (read-and-infer holds). The interleaved
single ranking with explicit bands is what the binding design draws, and it makes
degradation a non-event: when rag is down the semantic provider contributes nothing
and the files providers keep serving, which is both honest and strictly better UX
than today's mode-wide offline state. Deleting the right-rail pillar follows the
no-dead-affordances discipline; keeping Mod+Shift+O as a thin consumer preserves the
corpus-navigation plane the actions rule names while collapsing the implementation to
one matcher. Deferring the reader split keeps this feature's blast radius at the
stores layer plus one route, with the design's compact state fully delivered.

## Consequences

- **Gains.** One user-facing "Search" with three sources; code files reachable by
  name from Cmd+K for the first time; rag outages degrade to name-matching instead of
  a dead mode; the mechanism vocabulary leaves the pixels; the dead pillar and the
  duplicate matcher go; the seam admits the designed Change provider and the reader
  split as registrations, not rewrites.
- **Costs and difficulties.** The `/code-files` route is a real contract addition to
  build, test, and review; the band policy must be tuned against real queries (an
  exact filename match must beat a mid-score semantic hit — the bands encode that,
  but the thresholds are judgment); the fallback fold-in changes the degraded state's
  shape (from mode-offline to provider-absent) and its tests.
- **Risks.** Rank-band misjudgment renders literal hits too high or too low —
  mitigated by explicit constants, unit vectors over the merge, and the dedupe-best-
  rank rule. The `/code-files` listing on a walk-capped repo is honest-truncated; the
  provider must render that truth or silently miss files.
- **Pathways opened.** The Change (commit) provider; the expanded reader split; any
  future source (settings, actions-on-entities) as a provider registration; the
  shared literal matcher for other name-narrowing surfaces.

## Codification candidates

- **Rule slug:** `search-is-a-provider-plane`. **Rule:** Every Cmd+K search source is
  a `SearchProvider` registered with the one `useSearchProviders` host — never a
  bespoke per-surface search fetch; results merge into one ranked interleaved list
  with explicit score bands (literal never masquerades as semantic); a provider
  narrowing client-side must hold a COMPLETE listing (walked to completion) or
  consume a dedicated bounded engine projection; no mechanism vocabulary (rag,
  semantic, vector) reaches a rendered search string. (Candidate; promote after one
  full execution cycle.)
