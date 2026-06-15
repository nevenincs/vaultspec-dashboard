---
tags:
  - '#audit'
  - '#codebase-centralisation'
date: '2026-06-15'
modified: '2026-06-15'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace codebase-centralisation with a kebab-case feature tag, e.g. #foo-bar.
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

The Rust engine (`engine/`) sweep is the next campaign wave. Platform substrate needs no
remediation (verdict: textbook single-source-of-truth).

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
