---
tags:
  - '#adr'
  - '#dashboard-sidebar'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-sidebar` adr: `sidebar surface` | (**status:** `accepted`)

## Problem Statement

The sidebar is the dashboard's left scope rail: the standing column on the left edge of
the four-region frame that anchors *where you are* and *what you are looking at* before
the center stage renders the graph. It is the leftmost of the four regions established by
`AppShell.tsx` (left scope rail, center stage, right activity rail, bottom timeline), and
it hosts two things — the worktree switcher (the scope chooser, specified in its own
sibling ADR and treated here only as a hosted slot) and the vault-scoped, read-only file
browser over the canonical `.vault/` corpus, today `VaultBrowser.tsx` with its selection
join in `browserSelection.ts`.

This surface needs its own ADR for two reasons. First, the base UI design language and the
iconography ADR have just retired the prior paper-warm brand skin and hand-drawn glyph
family; the sidebar's current form still carries that legacy (literal Unicode glyphs in a
`DOC_GLYPHS` map, `bg-paper`/`text-ink` legacy class names), so it must be re-specified
against the inherited token, motion, density, and icon laws rather than re-skinned ad hoc.
Second, the rail is a chrome surface that sits exactly on the layer-ownership fault line:
it is the boring, reliable, file-thinking entry path into the corpus, and it must project
over the one model and consume the wire only through the stores layer — never grow its own
fetch, its own node shape, or its own degradation logic. This ADR pins the sidebar's
scope, behaviour, and UI/UX so the redefinition is grounded, not improvised. It is spec
work; it re-decides nothing the base language already settled and authorizes no
implementation.

## Considerations

The current form is real and small. `AppShell.tsx` already frames the rail as an `aside`
with a collapse toggle (16rem expanded, 2.5rem collapsed) driven by `leftRailCollapsed`
in the view store, a header reading "Scope", and a scrollable content area that stacks the
`WorktreePicker` and the `VaultBrowser` separated by a rule. `VaultBrowser.tsx` reads the
vault tree through the `useVaultTree(scope)` stores query, groups entries by `.vault/`
subtree in a fixed canonical order (research, adr, plan, exec, audit, reference, index)
with unknown groups appended alphabetically, renders a collapsible section per group, and
draws each row with a doc-type glyph, the stem, the first feature tag, and a compact
freshness label. `browserSelection.ts` already implements the bidirectional selection
join: a row click maps the vault path to the contract's document node id
(`doc:<stem>`) through the shared selection, and the current selection highlights the
matching row — joined on the stable-id derivation, never a private convention.

What the base language requires of this surface. As supporting chrome, the rail is
attenuated so the work surface leads — dimmed navigation, brightest active surface (base
language layers 4 and 7). Density is compact-but-breathing with pixel-precise alignment.
Depth is felt not seen: soft rounded low-contrast 1px borders, no heavy boxes, consistent
radius. Motion is fast, subtle, state-communicating, and keyboard-initiated actions never
animate; `prefers-reduced-motion` swaps transitions for instant changes. Color is spent
not sprinkled: the single muted accent carries selection, hue is never load-bearing for
identity. Typography uses the UI sans with tabular numerals on the freshness counts and
any data-bearing numerals, and the monospace is reserved for true identity (the stem,
which is a vault path identity). Iconography is hybrid: the rail's structural chrome marks
(the collapse chevron, the section disclosure chevrons) come from Lucide, and the
expressive doc-type marks come from Phosphor (or are authored in-family on Phosphor's
grid), each passing the 14px grayscale-by-shape gate — which retires the current literal
Unicode glyph map.

What the wire contract requires. The vault tree is `GET /vault-tree?scope=` (foundation
reference §3): paths plus doc type plus feature tags plus dates, metadata only, no
content. Scope is fully stateless — every working-tree-dependent read takes a required
`scope` parameter — so the rail reads relative to the active worktree the hosted switcher
selects, and the browser query is keyed by scope. Every response carries the per-tier
`tiers` degradation block (§2), which the sidebar must render as designed degraded state,
never as a bare error.

## Constraints

Invariants this surface honors. The four-layer ownership boundary is absolute: the sidebar
is app-chrome and never `fetch`es the engine, never defines its own node shape, and never
reads the raw `tiers` block — it consumes stores selectors and query hooks, and emits
select/expand intent back. Every dashboard view is a projection over the one model; the
file browser is the tree projection of the vault corpus surfaced by the `/vault-tree`
query, not a new model nor a per-view fetch. Selection identity rides the contract's
stable document node id (`doc:<stem>`); the rail must never mint a private row-identity
convention, because the shared selection join depends on that derivation. Graph reads stay
bounded and the rail never triggers an unbounded read — the vault tree is a
metadata-only, naturally feature-bounded listing, and any descent into the graph is the
stage's bounded concern, reached only by emitting a selection.

Parent dependencies and their stability. The base design-language ADR and the iconography
ADR are accepted and provide the tokens, motion budget, density register, and the
Lucide-chrome / Phosphor-domain icon split this surface inherits wholesale; both are
stable and re-decided nothing here. The foundation wire contract (`/vault-tree`, the
`tiers` block, stateless scope) is a settled parent feature already consumed by the
shipping browser. The stores layer's `useVaultTree`, the selection store, and the
`browserSelection.ts` join are existing, working primitives. The worktree switcher is a
*sibling ADR*; this ADR treats it strictly as a hosted slot at the top of the rail and
specifies nothing about its internal behaviour, deferring entirely to that ADR for the
scope-selection contract.

What it must NOT do. It must not fetch, not author or mutate vault documents (the corpus
is read-only here and authoring is a contract non-goal), not introduce a new ground/mood,
color architecture, type scale, motion budget, or icon source, not preview document
content (the tree is metadata-only by contract; the inspector owns detail), and not absorb
the worktree switcher's specification.

## Implementation

**Rail layout, placement, and collapse.** The sidebar remains the leftmost region of the
four-region frame, a vertical `aside` pinned to the left edge, full content height above
the bottom timeline. It carries a slim header band labelled "Scope" with a collapse
toggle at its leading edge using the Lucide chevron; expanded it is a comfortable
fixed-width column (the current 16rem is the right register — wide enough for stems and a
feature tag, narrow enough to cede the stage primacy), collapsed it is a thin spine
(~2.5rem) showing only the expand affordance. Collapse state is view-store state
(`leftRailCollapsed`), persists per the user-state mechanism the stores own, and the
collapse toggle is a keyboard-initiated action so it does not animate; the width change
itself, if animated at all, is a short token-bounded transition that `prefers-reduced-
motion` reduces to an instant snap. The rail is attenuated chrome: dimmed by default with
the active surface (a selected row, a focused control) brightest, so it never competes
with the stage for attention.

**Sections.** Inside the expanded rail, content stacks top-to-bottom as: the hosted
worktree switcher slot (scope chooser; sibling ADR owns it), a soft 1px rule, then the
vault file browser filling the remaining scroll height. This ordering is deliberate —
scope is chosen before its corpus is read, mirroring the stateless-scope contract where
every tree read is relative to the active worktree.

**Vault file-tree behaviour.** The browser is the tree projection over the `/vault-tree`
query for the active scope. Entries group by `.vault/` doc-type subtree in the canonical
order (research, adr, plan, exec, audit, reference, index), unknown groups appended
alphabetically, each group a collapsible disclosure section with an `aria-expanded`
chevron, the group name, and a count rendered in tabular numerals. Within a group, rows
sort by path and show, left to right: the doc-type mark, the document stem (monospace, as
path identity, truncating with the full path on hover/title), the first feature tag as a
dimmed `#tag`, and a right-aligned freshness label. Doc-type marks are sourced from
Phosphor per the iconography ADR — one mark per doc type, each validated against the 14px
grayscale-by-shape gate — replacing the legacy Unicode glyph map; the marks read in
`currentColor` and inherit the rail's dimmed ink so hue is never the identity channel.
Freshness is the existing compact relative label (now / Nh / Nd / Nw, cooling to blank),
rendered in tabular numerals and tinted with the single accent for genuinely fresh items
only — a purposeful liveness cue tied to real recency, not ambient decoration. Feature
tags are the existing grouping primitive surfaced as projected context, never a new model.

**Selection (bidirectional).** A row click emits the shared select intent — mapping the
vault path to the contract document node id (`doc:<stem>`) — which focuses the
corresponding node on the stage; conversely, when the shared selection names a document
present in the tree, its row highlights with the muted accent (subtle fill, the active
surface brightened). The join is exactly the stable-id derivation already in
`browserSelection.ts`; the rail emits intent and consumes selection state through the
stores, and never reaches the stage or the engine directly. Group expand/collapse is local
view affordance state.

**States rendered.** The browser renders four honest states. Loading: a quiet,
copy-toned pending line while the tree query is in flight (no spinner theatre; a small
purposeful liveness cue is acceptable but subordinate). Empty: an approachable empty state
when a scope resolves to no vault documents (a real, common condition for a non-vault
worktree), explaining the absence rather than reading as a fault. Degraded: when the
`tiers` block (read only through the stores hook, never raw) reports a tier absent or a
backend down, the affected facet renders as a designed degraded state with the degradation
reason surfaced in copy tone — the tree still lists what it can and the rail never presents
a healthy-looking error. Error: a genuine `/vault-tree` failure renders a contained,
non-alarming "vault tree unavailable" message scoped to the browser region (the existing
error-boundary region keeps a browser fault from taking down the rail), distinguished from
degradation so the user can tell "this read failed" from "a backend is down".

**Keyboard contract and a11y.** The rail is keyboard-first. Focus order runs top-to-bottom:
collapse toggle, then the worktree switcher slot, then each group disclosure control, then
its rows in document order, skipping collapsed groups. Disclosure controls carry
`aria-expanded`; the browser is a labelled navigation landmark (`aria-label="vault
browser"`); rows are activatable controls with the full path as accessible context.
Arrow-key navigation moves between rows within the focus model, Enter/Space activates
selection, and the disclosure chevrons toggle their group. Selection highlight is conveyed
by more than hue (fill plus weight, honoring the grayscale-safe identity gate). All
keyboard-initiated actions are instant — no animation — and `prefers-reduced-motion`
collapses any hover/selection transition to an immediate state change. The collapse toggle
and every control carry intent-revealing `aria-label`s.

**Place in the four-layer ownership map.** The sidebar is app-chrome (the glass): it
consumes stores selectors and the `useVaultTree` query hook, emits select and expand
intent back through the shared selection and view store, never fetches the engine, defines
no node shape, and reads `tiers` only through a stores hook. It projects over the one model
— the engine's linkage graph mirrored client-side by the stores — by rendering the
`/vault-tree` projection of the vault corpus and joining selection on the contract's stable
ids. Adding to this surface means adding a stores selector or query and a dumb view here,
never a new endpoint or a rail-local fetch.

**Tokens, motion, density, icons applied to this surface.** All visuals resolve to the
inherited `:root` token layer: surfaces are the warm low-chroma neutrals carried into dark,
the rail dimmed relative to the stage, borders the soft rounded low-contrast 1px rule,
selection the single muted accent, freshness the same accent used sparingly. Type is the UI
sans with tabular numerals on counts and freshness and the monospace on stems; motion is
the short token-bounded UI transition with the reduced-motion and keyboard-instant carve-
outs; icons are Lucide for the chevrons and Phosphor for the doc-type marks. No new
ground, mood, palette, type scale, motion budget, or icon source is introduced.

## Rationale

The decision is a faithful application of the accepted base language to one surface, not a
fresh design. The base design-language ADR fixes the trend-follower register, the
attenuated-chrome law ("don't compete for attention you haven't earned"), the
compact-but-breathing density, the felt-not-seen depth, and the warmth-in-tokens
discipline; the sidebar as supporting navigation is precisely the surface those laws were
written to govern, so re-specifying it against them is the correct move and re-deciding any
of them would be out of scope. The iconography ADR settles the Lucide-chrome / Phosphor-
domain split and the 14px grayscale-by-shape gate, which is what justifies retiring the
current literal Unicode `DOC_GLYPHS` map in favour of in-family marks. The foundation wire
contract makes the rest mechanical: `/vault-tree` is a metadata-only, scope-keyed,
tiers-bearing projection, so the browser is honestly a dumb tree view over an existing
query, and the stateless-scope rule is what motivates placing the scope chooser above the
corpus it scopes. The bidirectional selection join is kept because it already realizes the
contract's stable-id identity guarantee and the model/view projection rule — the rail emits
intent and consumes selection, exactly the Qt-style separation the layer-ownership and
projection rules already settled. Honoring the `tiers` block as designed degradation rather
than error is the contract's truthfulness mechanism applied at this surface.

## Consequences

- **Gains.** The sidebar reads as a native member of the agentic-desktop cohort: a quiet,
  attenuated, keyboard-first scope rail that cedes attention to the stage. Doc-type
  identity becomes grayscale-safe and theme-correct for free by moving onto the shared
  `currentColor` + token icon path. The four honest states (loading, empty, degraded,
  error) make the rail truthful under backend degradation instead of presenting
  healthy-looking errors. Keeping the browser a pure projection over `/vault-tree` means
  the surface inherits scope-correctness, caching, and degradation handling from the stores
  layer with no rail-local logic to drift.
- **Costs and difficulties.** Authoring the doc-type marks in-family on Phosphor's grid and
  re-passing the 14px grayscale gate is real, if bounded, work, and the legacy Unicode
  glyph map and legacy `bg-paper`/`text-ink` class usage must be migrated to the inherited
  tokens. The empty and degraded states must be designed with genuine copy tone rather than
  reusing a generic error, which is design effort, not just code. Tabular-numeral and
  monospace discipline on the right elements must be held deliberately.
- **Risks.** The standing temptation is to let the rail grow a convenience fetch or a
  private row-identity shortcut "because it is just the file list"; both would breach the
  single-wire-client boundary and the stable-id join — the codification candidate guards
  the first. Warmth could creep back as decoration in empty-state illustration; the base
  language's warmth-in-tokens guardrail governs that. A doc-type mark could fail the squint
  test and need re-authoring.
- **Pathways opened.** A clean, projection-only sidebar makes new left-rail facets (a
  filter affordance, a folder-context selector already projected in `browserSelection.ts`,
  or a future second projection such as a flat search-scoped list) cheap to add as further
  stores-backed dumb views, and the hosted-slot pattern keeps the worktree switcher and any
  future scope tools composable without entangling the browser.

## Codification candidates

- **Rule slug:** `sidebar-is-a-projection-not-a-wire-client`.
  **Rule:** The left scope rail and its vault file browser must consume the corpus only
  through the stores' `/vault-tree` query hook and join selection on the contract's stable
  document node id (`doc:<stem>`), never issuing its own `fetch`, defining its own row
  identity, or reading the raw `tiers` block. (Candidate only; this is a per-surface
  application of the existing `dashboard-layer-ownership` and `views-are-projections-of-one-
  model` rules and should be promoted only if the single-wire-client boundary proves to
  need a sidebar-specific restatement after one full execution cycle — otherwise the
  existing rules already bind it.)
