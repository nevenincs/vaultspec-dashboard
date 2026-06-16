---
tags:
  - '#adr'
  - '#figma-frontend-rewrite'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace figma-frontend-rewrite with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, or deprecated. A new ADR starts as proposed; it moves to
     accepted or rejected when the decision is made, and to deprecated
     when a later ADR supersedes it.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `figma-frontend-rewrite` adr: `complete frontend teardown and Figma-binding rewrite` | (**status:** `accepted`)

## Problem Statement

The shipped dashboard frontend is rejected wholesale. The product owner declares the binding
Figma file (key `SlhonORmySdoSMTQgDWw3w`, page `Components`) the single, absolute source of
truth and directs a complete teardown and rewrite of every visible element so the running
application looks and behaves exactly like the designs — every colour, line, metric, glyph,
component, surface, and the node graph itself. Any divergence between the current code and the
designs is to be ignored and overwritten; the prior parity-reconciliation cycle is superseded
and treated as not-current. The work is 100% scoped and terminates only when every divergence
is fixed, tested, matched, validated, hardened, and verified functional and identical.

## Considerations

The binding file is a single `Components` page carrying both the design system and the assembled
surfaces. It defines: a centralized variable set (a warm low-chroma neutral ramp `neutral/0..980`,
a single green accent ramp, diff add/remove pairs, semantic surface/ink/border tiers, chrome
tokens, a full scene/graph palette of category + state + status + tier colours, three elevation
shadows, and code-syntax colours); a type system on `Fraunces` (serif, titles/headings) and
`Inter` (UI/body) — the current build ships only Inter and JetBrains Mono, so `Fraunces` is a
concrete missing dependency; a centralized component kit (Button, IconButton, Tab, SectionLabel,
Chip/Badge, SearchField, Card, ListRow, Switch, SegmentedToggle, ProgressBar, Kbd, Slider,
Divider, Breadcrumb, Tooltip, TreeRow, a Phosphor/Lucide glyph set, DropdownButton, StatusDot,
PropertyRow, CodeBlock, CodeViewer); and the assembled surfaces (a master `AppShell`, `LeftRail`,
`ActivityRail`, `DocHeader`, the stage toolbar + category legend + node graph + zoom cluster +
minimap, a dual-lane `Timeline` with scrubber, `CommandPalette`, `SettingsDialog`, `ContextMenu`,
`KeyboardShortcuts`, `DiffView`, and the Markdown/Code reader-viewer family in view and edit modes).

The decisive architectural fact is that the codebase is already four one-way layers. Only two of
them are visible — the app chrome and the scene's paint — and only those are wrong. The data
backbone (the stores layer: the sole wire client, the TanStack query hooks, the zustand view
stores, the wire adapters, the per-tier degradation block) and the scene's command/event seam
(the `SceneController` union, the FieldLayout layout driver, the PixiJS mount) are invisible
plumbing that already work and already serve the real engine. Rewriting them would manufacture
backend regressions for no visual gain.

## Constraints

The binding project rules fence this work and are honored, not waived: the rewrite consumes the
existing stores hooks and the `SceneController` command/event contract UNCHANGED; the rewritten
view adds no new `fetch` against the engine, mints no new client node shape, and never reads the
raw per-tier block directly — degradation is read only through the stores' availability hooks.
Every visible primitive derives from the one centralized component kit (no ad-hoc buttons, chips,
tabs, or raw hex). Colours come only from the generated token tier; scene-read tokens are emitted
as literal hex (the canvas reader cannot resolve a `var()` chain). Icons come only from the two
sanctioned families. "Green" means the full lint gate (`just dev lint frontend`, exit 0) — eslint
+ prettier + tsc — not a partial run. Where a design genuinely needs a wire datum the preserved
contract cannot express, that is a deliberate, reviewed change to the engine projection and the
stores layer FIRST, then consumed by the view — never an incidental fetch grown inside a component.
The only named external dependency gap is the `Fraunces` font, added as a bundled/served face.

## Implementation

The rewrite proceeds as a dependency-ordered rollout supervised as a managed team, one builder
owning a disjoint file set per surface so parallel work never contends the same files (commits by
pathspec on the shared index). Wave 0 authors the token foundation: the centralized variable set
is transcribed verbatim into the DTCG/token source and generated stylesheet (light, dark, and
high-contrast as peer remaps of one semantic tier), and `Fraunces` is added to the served fonts.
Wave 1 rebuilds the centralized component kit as standardized React components matched to the kit
board, each with its Figma variant/state matrix, so every later surface composes from real shared
definitions. Wave 2 fans out across the surfaces — shell, rails, doc header, stage chrome, timeline,
palette, dialogs, menus, readers/viewers — each builder rebuilding its board exactly, consuming the
preserved stores hooks for data and emitting intent back, and validating against the Figma node
screenshot with vision before declaring done. Wave 3 re-skins the scene's paint so the node graph
matches the graph boards exactly: category-coloured node fills, the grey connection rule, tier and
state encodings, hover and selection treatment, the zoom cluster, and the minimap — all driven
through the unchanged `SceneController` seam. Wave 4 integrates, runs the full gate plus the test
suite, hardens, and verifies the assembled application is visually and functionally identical to
the designs, fixing any remaining divergence or backend regression until it is.

## Rationale

The four-layer ownership boundary is exactly what makes a total view rewrite safe: the face can be
replaced without touching the nervous system or the backbone. Binding the rewrite to consume the
frozen stores/`SceneController` API as its contract is what keeps "rewrite every component" from
silently becoming a stealth rewrite of the working data layer and re-scattering wire access across
the view — the failure mode the single-consumer boundary and the mock-vs-live discipline exist to
prevent. Centralizing every primitive in one kit first is what makes pixel parity mechanical and
keeps a control on screen always meaning a real, shared, themeable definition rather than per-surface
drift. Authoring tokens from the binding variable set (rather than inventing values) makes retheming
one edit and satisfies the gospel directive by construction. Grounding the extraction in the live
file via the read MCPs and validating each surface with vision keeps the match honest to the pixel.

## Consequences

Gains: a frontend that is, by construction, the designs; a single themeable token tier and component
kit that future surfaces inherit; zero backend regression because the data and scene contracts are
untouched. Difficulties: the surface count is large and the bar is exact-match, so the cost is in
breadth and verification, not novelty; the scene re-skin must respect that the renderer reads literal
hex, and the graph's visual parity is judged against static boards while it renders live data.
Pitfalls guarded against: a builder quietly adding a fetch or a bespoke primitive (forbidden by the
preserved contract and the centralized-kit rule), a partial lint run passing a dirty commit, and a
font/colour value typed by eye instead of read from the variable set. Pathway opened: once the kit
and tokens are the binding ones, Code Connect can cross-map the kit components to the live file so
design and code stay bound going forward.

## Codification candidates

- **Rule slug:** `figma-is-the-binding-source-of-truth` (exists).
  This rewrite is the worked enactment of that rule; no new rule is required. The preserved-contract
  discipline is already covered by `view-rewrite-preserves-the-state-and-scene-contract` and the
  centralized-kit discipline by `design-system-is-centralized`. Revisit only if the rollout surfaces
  a durable, cross-session lesson not already bound by those rules.
