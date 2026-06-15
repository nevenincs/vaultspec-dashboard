---
tags:
  - '#audit'
  - '#codebase-centralisation'
date: '2026-06-15'
modified: '2026-06-15'
related: []
---



# `codebase-centralisation` audit: `rag-driven semantic centralisation health audit`

## Scope

First sweep of an ongoing, ever-expanding campaign whose mandate is: every domain of
the dashboard must have clear, singular, centralised implementations — no shadowing,
duplication, shims, legacy paths, compatibility layers, scaffolds, or temporary code,
save for the in-flight edges actively under construction. Mimicking is finished; items
already exist.

Method: vaultspec-rag semantic search was the primary discovery tool (concept queries
per domain to surface the same idea implemented in more than one place), confirmed by
exact `grep`/read of every candidate. Four frontend domains were swept by parallel
read-only auditors against five anti-pattern dimensions — duplication, shims/compat,
scaffolds/dead code, shadowing (no single source of truth), and layer-boundary
violations:

- **Platform substrate** — `frontend/src/platform/` (the "action states" layer).
- **Stores / data state** — `frontend/src/stores/` (sole client of the engine wire).
- **Scene / render** — `frontend/src/scene/`.
- **App chrome** — `frontend/src/app/`.

In-flight plans (`dashboard-settings` ~15%, `dashboard-timeline` ~98%,
`dashboard-workspace-registry` ~95%) were treated as expected churn, not defects. The
Rust engine (`engine/`) is deferred to a follow-up wave.

## Findings

Layer-boundary discipline is **clean across all four domains**: no `app/` or `scene/`
code fetches the engine or reads the raw `tiers` block, `platform/` has zero upward
imports, and scene token reads correctly fall back on non-hex values (the literal-hex
contract holds). The defects below are all centralisation debt — one concept owned in
many places — not boundary breaches.

### HIGH

**H1 — The per-tier degradation read is duplicated 8+ times instead of one reader.**
The identical "tier unavailable → push to `degradedTiers`, record reason" loop appears
across `frontend/src/stores/server/queries.ts` (lines 196, 260, 398, 471, 596, 667,
1238, 1363), re-expressed again in `searchController.ts`, `degradationInputs.ts`,
`deriveDiscoverView`, and `deriveRagStatusView`. Seven separate `*Availability`
interfaces re-declare the same `{degraded, degradedTiers, reasons}` triplet. Worse, the
fresh-error-wins-over-stale-success precedence the wire honesty law requires is applied
by hand at each site and is **inconsistent**: `useWorkPillarAvailability` orders
`fromError ?? data.tiers` while `useVaultTreeAvailability` orders `fromData ??
fromError`. This directly contravenes the project's own
`degradation-is-read-from-tiers-not-guessed-from-errors` rule, which mandates a single
reader. A new tier or a precedence fix must touch 8+ sites.
*Owner/action:* one `readTierAvailability(tiers, tierNames)` primitive plus one
`tiersFromQuery({data, error})` helper encoding the precedence once; every `derive*`
becomes a thin wrapper, and the `Availability` interface collapses to one type.

**H2 — `getCssColor` is triplicated byte-for-byte across the scene token-read seam.**
An identical private `getCssColor(varName, fallback): number` is declared in
`frontend/src/scene/field/nodeSprites.ts` (24-30), `edgeMeshes.ts` (37-43), and
`overlayLayer.ts` (19-25), with two further near-variants (`readCanvasBg` in
`pixiField.ts`, `token` in `minimapLayer.ts`). This is the most load-bearing contract in
the layer — the scene-read theme seam that the `themes-are-oklch-generated-from-a-token-tier`
rule says must read literal hex because `getComputedStyle` cannot resolve a `var()`
chain — yet the "must be hex, else fall back" discipline is re-encoded in five places and
can silently drift. (No correctness defect today: every copy falls back correctly.)
*Owner/action:* one `scene/field/tokenReads.ts` exporting `cssColorNumber` and
`cssColorString` (a `tokenReads.test.ts` already asserts this seam); all five readers
consume it.

### MEDIUM

**M1 — Canonical tier-name list copy-pasted 5–6 times.** `["declared", "structural",
"temporal", "semantic"]` appears as five independent `as const` arrays under six names
(`TIER_ORDER`, `ARC_TIERS`, `CANONICAL_TIERS`, `VAULT_TREE_TIERS`, `GRAPH_SLICE_TIERS`,
`SALIENCE_SLICE_TIERS`) across `liveAdapters.ts` and `queries.ts`, plus inline in
`viewStore.ts`. This is identity-bearing contract vocabulary; membership and tie-break
order are entangled across files. *Action:* export one ordered `CANONICAL_TIERS` from
`engine.ts` (which already owns `TiersBlock`); per-surface single-tier subsets stay
local.

**M2 — `pins.ts` and `lenses.ts` duplicate the entire scope-keyed-persistence
scaffold.** Both re-implement the same `storageKey(workspace, scope)` pattern,
corrupt-blob recovery on load, best-effort save, localStorage guard, and reload-on-swap;
only the value shape differs. *Action:* one `createScopedStore<T>({prefix, parse,
serialize})` factory; pins and lenses become two configurations (and `salienceLens` /
`browserMode` / `filters` are further candidates).

**M3 — rag "running" lifecycle derivation in three places.** The predicate "rag is up iff
the lifecycle word is exactly `running`" is independently encoded in `liveAdapters.ts`
(385), `queries.ts` (1123), and `searchController.ts` (165) — the last with a comment
admitting it "mirrors `adaptStatus`/`deriveRagStatusView`". *Action:* one exported
`isRagRunning(word)` predicate consumed by all three.

**M4 — `glyphs.ts` placeholder glyph provider is dead production code.** The entire
`ProgrammaticGlyphs` module (a second glyph builder *and* a second SDF rasterizer,
`polygonSdf`) is imported only by its own test; production assembly instantiates
`DomainGlyphs` exclusively. It advertises itself as the "GPU-free fallback for the node
test env," but nothing selects it as a fallback — the seam has exactly one live
implementation and the domain-mark family that replaced it already landed (W02.P17).
*Action:* delete `glyphs.ts` + its test, or genuinely wire it as the
no-renderer fallback so the claim becomes true. `DomainGlyphs` is the singular owner.

**M5 — The filter-facet idiom is fragmented across three chrome files.** Two settled
duplications over the same `useFilterStore`: (a) the "value-in-array → toggle" reducer is
copied into `FilterBar.tsx`, `FilterSidebar.tsx`, and `TimelineControls.tsx`; (b) the
facet-chip presentational component exists as `FacetChips`, `ChipGroup`, and `FacetList`,
already **drifting in a11y semantics** (`role="switch"`/`aria-checked` vs
`aria-pressed`). *Action:* promote one `toggleFacet(facet, value)` action onto
`stores/view/filters` (the store owns the arrays, so no `current` need be passed), and
extract one shared `FacetChipGroup` primitive standardised on the correct `role="switch"`
semantics, with `FacetList` as its checkbox variant.

### LOW

**L1 — `prototype/StatusGallery.tsx` is a dead dev-only Vite entry.** An intentional
`prototype.html` harness for the now-**complete** `node-visual-richness` feature; per the
"no scaffolds" mandate it is a removal candidate now that the feature has shipped.

**L2 — doc-stem id grammar overlaps.** `searchController.ts` `pathToDocNodeId` and
`liveAdapters.ts` `deriveSearchNodeId` both implement the `doc:{stem}` grammar (one short
regex). Extract a single `stemFromPath`/`docNodeIdFromStem` pair; keep the code/vault
branching on top.

**L3 — "N hidden" cost-label formatted twice.** `FilterBar.tsx` exports a tested
`hiddenCountLabel`; `FilterSidebar.tsx` re-derives the identical string inline. Import the
helper.

**L4 — Stale "placeholder shell" comment.** `app/islands/IslandLayer.tsx:8` calls the
island content a placeholder, but the real `NodeInterior` is mounted (line 17). Update the
comment — it reads as unfinished scaffold to the next agent.

**L5 — `timing.ts` omitted from the platform barrel.** `platform/index.ts` re-exports
every other substrate module but not `./timing`; its three `debounce` consumers
deep-import. Add the re-export (or document timing as deep-import-only).

**L6 — `app/menu` vs `app/menus` naming hazard (informational, not a defect).** `menu/`
is the singular `ContextMenuHost`; `menus/registerAll.ts` is the resolver registry —
correctly partitioned, one-resolver-per-kind enforced. The one-letter difference is a
readability hazard worth a rename consideration, but there is no behavioural duplication.

### Engine (Rust) — wave 2

The engine is structurally honest on every boundary: read-and-infer (no `.vault` writes,
no git mutation, `/ops/*` forwards sibling envelopes verbatim), CPU-only graph compute (no
CUDA/torch/wgpu in any crate), identity-bearing stable keys (one `edge_id` composition that
excludes resolution/rule outcomes), and bounded reads with honest `truncated` blocks at
every door. Four centralisation defects:

**E1 (HIGH) — the tiers block is built by two different helpers across the two wire
surfaces.** `engine-query/src/envelope.rs` `tiers_block()` is the canonical builder, but
`vaultspec-cli/src/envelope.rs` hand-rolls the identical contract §2 block as `tiers_json()`
with a separate `json!` shape (hardcoding `structural`/`temporal` as always-available). The
CLI **already depends on `engine-query`** (and imports its graph/events/node/filter
modules), so the canonical helper is one import away. This is precisely the cross-surface
drift `every-wire-response-carries-the-tiers-block` was promoted to prevent ("the same
omission shipped independently on *both* wire surfaces"). *Action:* make
`engine-query::envelope` the sole tiers-block source; CLI `tiers_json` delegates to it,
keeping only the CLI's own `{ok,command,status}` envelope vocabulary.

**E2 (MED, in-flight) — duplicated document node-ceiling constant.** `MAX_GRAPH_NODES`
(`engine-query/src/graph.rs`, 5000) and `MAX_DOCUMENT_NODES` (`engine-query/src/lineage.rs`,
5000); lineage's own comment says "the same 5000-node ceiling the graph-query route
enforces" then redeclares it. `lineage.rs` is the **actively-integrating** timeline-lineage
campaign — flagged for that campaign to fold into one shared const before it settles, not
edited here to avoid colliding with in-flight work.

**E3 (MED) — scope-token canonicalisation implemented twice, byte-identical.**
`vaultspec-cli/src/cmd/mod.rs` `clean_path` and `vaultspec-api/src/routes/mod.rs`
`scope_token` have identical bodies, both claiming to be "the one canonical scope-token form
everywhere". Scope tokens are identity-bearing on the wire. *Action:* lift one copy into a
shared low-level crate (`engine-model`/`engine-store`, already shared by both front doors)
and have both call it.

**E4 (LOW) — `asof_graph` self-labelled "back-compat shim" with one caller.**
`engine-graph/src/asof.rs` wraps `asof_graph_resolved` for "callers that need only the
graph"; the single live caller (`vaultspec-cli/src/cmd/graph.rs`) can take
`asof_graph_resolved(...).graph` directly. Per the no-shim mandate, inline and retire.

### Second pass (2026-06-15)

A wider net — codebase marker grep plus rag probes for cross-cutting utility duplication
(formatting, id/key builders, transport wrappers, lane/mark vocab) — surfaced one new
finding; the dimensions below are otherwise clean.

**F-T1 (MED, deferred to timeline campaign) — dead retained event-mark transport in the
timeline surface.** `app/timeline/Timeline.tsx` keeps a "retained legacy" event-kind cluster
— `LANES`, a local `laneOf(kind)`, `EVENT_MARKS`, `eventMark(kind)`, and the `onEventClick`
prop — plus `app/timeline/eventSelection.ts` `handleEventClick`. None have a live caller: the
relational surface renders through `phaseLanes.ts` `laneOf` (`laneOfNode`) + `PHASE_LANES`,
the only wired handler is `handleNodeClick`, and `onEventClick` is not even destructured. The
timeline's `eventMark`/`EVENT_MARKS` also **duplicate** the live `eventMark` in
`app/right/ChangesOverview.tsx` (the singular live owner). This is verifiably dead compat the
mandate forbids — but it is freshly-delivered code that the timeline-lineage campaign retained
deliberately "so wiring keeps type-checking while the primary marks switch to lineage nodes",
i.e. an in-flight transition edge. *Action (timeline campaign):* once the lineage migration is
declared final, delete the dead cluster (`LANES`/local `laneOf`/`EVENT_MARKS`/`eventMark`/
`onEventClick` in `Timeline.tsx`, `handleEventClick` in `eventSelection.ts`, and the test
cases pinning them); `ChangesOverview.eventMark` remains the one event-kind→mark owner.

**F-S1 (MED) — REMEDIATED. One `useElementWidth` hook for three copied
`ResizeObserver` width effects.** `app/timeline/Timeline.tsx`, `TimelineControls.tsx`, and
`Playhead.tsx` each reimplemented the same observe-`contentRect.width`-into-state effect.
Extracted `app/chrome/useElementWidth(ref, {parent?})` (treats a pre-layout 0 as
not-yet-measured); all three route through it, each keeping its own fallback. `Stage.tsx`'s
observer drives `SceneController.resize(w,h)` — a distinct scene-mount concern, correctly left
alone. Behaviour-preserving (live code, no migration entanglement); tsc + 154 timeline/chrome
tests + lint green. Committed `411b646`.

**F-S2 (LOW, opportunity — not remediated) — Escape-to-dismiss handled independently in ~11
surfaces** (`Dialog`, `CommandPalette`, `ContextMenuHost`, `WorkspacePicker`, `WorktreePicker`,
`OpsPanel`, `SearchTab`, `AlgorithmPanel`, `Discover`, `FilterSidebar`, `RangeSelect`). These
share the "listen for Escape" skeleton but each does a genuinely different dismiss action
(close dialog / clear palette / cancel a drag / collapse a panel), so they are idiom
repetition, not behavioural duplication. A `useDismissOnEscape(onDismiss)` hook would DRY the
listener, but forcing 11 heterogeneous handlers through one hook risks over-abstraction for a
thin win — recorded as a deliberate non-remediation, revisit only if the listener wiring
itself drifts.

Dimensions confirmed clean on the second pass: no `shim`/`stop-gap`/`to be removed`/`for now`
markers in shipped code (the `deprecated`/`legacy` hits are all legitimate ADR-status domain
vocabulary, the ADR-sanctioned `plan-structure-tolerance` legacy-plan reading fallback, or the
mandated tolerant `git.dirty` wire adapter — none are code shims); no relative-time formatter
duplication (none exists); no duplicate transport/fetch wrappers (one `EngineClient`); no
duplicate id/key builders beyond the already-consolidated stem grammar; no `cx`/`clsx`-style
className-joiner reimplemented across chrome.

## Recommendations

Remediation order (each is mechanical consolidation with existing test coverage nearby,
low blast radius, and should be planned/approved before edits land):

1. **H1 first** — it is the largest win and the one that violates an existing codified
   rule. One `readTierAvailability` + `tiersFromQuery` pair retires 8+ copies and fixes
   the inconsistent precedence as a correctness side-effect.
2. **H2** — one `tokenReads` helper; the seam already has a test to pin behaviour.
3. **M1, M3** — trivial constant/predicate extraction, naturally bundled with H1 (same
   files).
4. **M4, L1** — dead-code removal (`glyphs.ts`, `prototype/`); confirm no remaining
   importer, then delete.
5. **M2** — `createScopedStore<T>` factory; touches persistence, so land with its own
   adversarial test.
6. **M5** — `toggleFacet` action + `FacetChipGroup` primitive; resolves an active a11y
   drift.
7. **L2–L6** — opportunistic cleanups, fold into whichever adjacent change touches the
   file.

Platform substrate needs no remediation (verdict: textbook single-source-of-truth).

### Remediation status (2026-06-15)

All frontend findings remediated and verified — frontend tsc clean, eslint clean, prettier
clean, 804/805 affected tests pass (the one failure, a `PUT /settings` 400 in
`session.test.ts`, is in-flight dashboard-settings schema-validation collateral, not from
this work):

- **H1** — `readTierAvailability` + `tiersFromQuery` + one `TierAvailability` type landed in
  `engine.ts`; 8 derive fns are thin wrappers, 7 interfaces collapsed, net −70 lines. Five
  sites (not one) had the precedence backwards; all now error-wins.
- **H2** — `scene/field/tokenReads.ts` (`cssColorNumber`/`cssColorString`) is the sole seam;
  five readers delegate.
- **M1** — one ordered `CANONICAL_TIERS` in `engine.ts`; all full-set copies replaced.
- **M2** — `stores/view/scopedStore.ts` factory; `pins`/`lenses` are configurations of it.
- **M3** — one `isRagRunning` predicate; three sites route through it.
- **M4** — dead `glyphs.ts` (+ test) deleted; `DomainGlyphs` is the sole owner.
- **M5** — `toggleFacet` store action + shared `FacetChipGroup` (correct `role="switch"`);
  `FilterBar`, `FilterSidebar`, and `TimelineControls` all consume them; the local
  `ChipGroup`/`FacetChips` copies and the 3-arg toggle helper are gone.
- **L1** — `prototype/` + `prototype.html` + the Vite entry removed.
- **L2** — shared `stemFromPath`/`docNodeIdFromStem`. **L3** — `FilterSidebar` imports
  `hiddenCountLabel`. **L4** — `IslandLayer` comment corrected. **L5** — `timing` added to
  the platform barrel. **L6** — naming hazard left as informational (no behavioural defect).

Engine wave — **E1, E3, E4 remediated and verified** (engine gate green: `cargo fmt --check`,
`cargo check --all-targets`, `cargo clippy --all-targets -- -D warnings` all exit 0, 321
tests pass; the final `vaultspec.exe` link is blocked only by the running dev server's
supervised engine holding the binary, an artifact lock — verified in an isolated target dir):

- **E1** — `engine-query::envelope::tiers_block` is now the sole tiers-block source; the CLI
  `tiers_json` delegates to it (and serializes the result), keeping only its own
  `{ok,command,status}` envelope wrapper.
- **E3** — one canonical `scope_token` `pub fn` in `engine-model`; `vaultspec-api` re-exports
  it and the CLI aliases it as `clean_path`, so both front doors mint scope tokens from one
  implementation.
- **E4** — the `asof_graph` back-compat shim is deleted; its one caller takes
  `asof_graph_resolved(...).graph` directly.

**E2 deferred** to the in-flight timeline-lineage campaign (its `lineage.rs` is actively
integrating — folding the duplicated 5000-node ceiling into one shared const there avoids a
concurrent-edit collision).

## Codification candidates

None promoted on this first sweep. H1 (the duplicated tiers read) is *already* governed
by the existing `degradation-is-read-from-tiers-not-guessed-from-errors` rule — the defect
is non-compliance, not a missing rule, so the fix is remediation, not codification.

One candidate to revisit *after* remediation lands and holds for a cycle:

- **Source:** H2 + M1 + M2 (the scene token-read seam, the canonical tier list, the
  scope-keyed store — each a contract-shaped primitive that was re-implemented rather than
  imported). **Provisional rule slug:** `shared-primitives-have-one-home`. **Rule:** a
  cross-cutting primitive (a wire-vocabulary constant, a token-read helper, a persistence
  scaffold) is defined once in its owning layer and imported, never re-declared per
  consumer. Hold until the consolidation has survived one execution cycle before
  promoting, per the codify discipline (never on first encounter).
