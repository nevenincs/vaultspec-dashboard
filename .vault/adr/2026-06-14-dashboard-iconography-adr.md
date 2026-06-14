---
tags:
  - '#adr'
  - '#dashboard-iconography'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-iconography-research]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
---

# `dashboard-iconography` adr: `icon framework adoption` | (**status:** `accepted`)

## Problem Statement

The base design-language ADR retires the dashboard's commissioned hand-drawn /
hand-generated glyph family and fixes the direction: adopt maintained, open-source icon
frameworks in a hybrid arrangement. That ADR deliberately left the concrete framework
selection and the chrome-versus-domain split to this bespoke ADR. This ADR pins which
frameworks are adopted, how the two icon planes are served, and how the irreducibly
domain-specific marks are handled — without retiring the product's identity gates. It is
spec work; it does not plan or perform the migration.

## Considerations

- **Two icon planes already exist in the codebase.** The DOM chrome
  (`frontend/src/app/`) renders React icon components (currently Lucide). The GPU canvas
  (`frontend/src/scene/field/glyphs.ts`, behind the `GlyphTextureProvider` seam in
  `nodeSprites.ts`) renders programmatic Pixi `Graphics` → `Texture` placeholders — not
  React, not SVG. Any framework chosen for the domain plane must yield clean per-icon SVG
  that can be turned into a texture, not only a React component.
- **`lucide-react` is a phantom dependency** — imported in seven chrome files and present
  in `node_modules` at v1.18.0, but not declared in `frontend/package.json`. This is a
  latent breakage independent of the design decision and must be formalized.
- **The retired family encoded 26 marks** across doc-types, a node-feature species mark,
  events, four abstract tier marks, five lifecycle states, and a progress ring, all under
  hard identity gates: distinguishable in pure grayscale at 14px by shape alone, legible
  at 14px, a three-weight line system (detail / primary / accent), single `currentColor`
  ink, 24px grid, round joins.
- **The base language is a trend-follower register** with restrained token-level tactile
  warmth; the icon choice must read native to the agentic-desktop cohort while supporting
  the weight-as-hierarchy and state-as-fill encodings the domain marks need.
- **The research compared nine frameworks** (Lucide, Phosphor, Tabler, Radix, Heroicons,
  Material Symbols, Iconoir, Remix Icon, Carbon) against these needs.

## Constraints

- **Domain semantics are not shipped by any framework.** The four abstract tier marks,
  the progress ring, the node-feature species mark, and the lifecycle state set must be
  authored in-family regardless of the framework chosen; the framework's value is a
  reproducible grid and weight system that makes that ongoing authoring sustainable.
- **The GPU plane forbids font-only delivery.** A framework whose multi-weight strength is
  delivered only as a variable font (Material Symbols) cannot serve the texture plane,
  because static SVG exports drop the axis range.
- **License must be permissive** (MIT / ISC / Apache / CC-BY). This excludes Remix Icon's
  non-standard license and disfavors Carbon's bundled telemetry.
- **The a11y identity gates are non-negotiable** and survive the framework swap: grayscale
  shape-distinction at 14px, 14px legibility, hue never load-bearing.
- **Parent dependency.** This ADR inherits the base design-language ADR; it does not
  reopen it, and it changes no architecture (the two-plane split already exists).

## Implementation

**Hybrid, two frameworks, mapped onto the two existing planes.**

**Structural chrome → Lucide.** The conventional structural marks (chevrons, zoom,
theme, close, settings, fullscreen, navigation, and future toolbar/control needs) stay on
Lucide. It is already wired, React-19-native, ISC-licensed, actively maintained, and its
git/file/network/workflow vocabulary covers foreseeable chrome needs. The only required
correction is to declare `lucide-react` as a real dependency, ending the phantom-import
state.

**Expressive / domain plane → Phosphor.** The marks that encode product meaning — the
doc-type marks, event marks, the node-feature species mark, the four tier marks, the
lifecycle states, and the progress ring — are sourced from or authored within Phosphor.
Phosphor is chosen for three product-specific reasons: its six-weight system
(thin/light/regular/bold/fill/duotone) maps directly onto the detail / primary / accent
line hierarchy the retired family required; its `fill` weight encodes lifecycle state
without leaving the family (preserving the "one hand" rule); and its clean per-icon SVG
(`fill=currentColor`, rounded joins) feeds both the React chrome and the Pixi/sigma
texture seam. Its rounded-join house style matches the restrained-tactile warmth of the
base language.

**The domain marks, classified.** Adopt directly from Phosphor, each validated against the
14px grayscale-by-shape gate before it ships: the seven doc-type marks and the event marks
(git-commit directly; file-plus / file-text for doc-created / doc-modified; flag-pennant
for lifecycle). Author in-family on Phosphor's grid: the four abstract tier marks (the
hard grayscale-shape gate makes them irreducibly bespoke), the node-feature species mark
(deliberately asymmetric, with its documented collision constraints against the
state-active ring), and the lifecycle state set (composed from Phosphor primitives,
honoring the active-versus-node-feature and broken-bolt collisions). The progress ring is
not an icon but a parametric primitive (exact arc fills) and is implemented as a small
programmatic component rather than static SVGs.

**Material Symbols is the aesthetic north-star, not the implementation.** The ADR records
Material Symbols (the Antigravity / Google lineage) as the visual register to aim the
authored marks toward, while rejecting it as a delivery mechanism because its axis
strength is font-only and breaks the texture plane.

**Single source per plane.** No third icon set is introduced; chrome reads Lucide, the
domain plane reads Phosphor plus the in-family authored marks. Both planes ultimately
consume the same `currentColor` ink and the shared token layer for hue.

## Rationale

The hybrid maps onto reality: the codebase already has a conventional-chrome plane (Lucide)
and a domain-glyph plane (the texture seam), so adopting one framework per plane is the
lowest-churn path that still retires the hand-drawn family. Lucide is kept because
switching well-functioning, already-wired chrome icons would be churn without payoff;
formalizing the dependency is the only real fix it needs. Phosphor wins the domain plane on
the one axis that matters most here — a true weight continuum plus state-by-fill — which no
other maintained set offers (Tabler has two styles, Material is font-only, the rest are
single-weight). The research confirmed the domain semantics are bespoke under any
framework, so the deciding factor is which framework makes sustained in-family authoring
easiest; Phosphor's reproducible grid and documented house style answer that. Keeping the
a11y gates and the `currentColor` discipline means the framework swap changes the *source*
of the marks, not the identity contract the marks must honor.

## Consequences

- **Gains.** The hand-drawn-family maintenance burden is dropped; chrome and domain marks
  both come from maintained, permissively-licensed sources; the phantom `lucide-react`
  dependency is corrected; the weight-and-fill encodings the domain marks need are
  available without bespoke tooling; the product reads native to the agentic-desktop
  cohort.
- **Costs and difficulties.** The commissioned 26-glyph family is largely set aside —
  a sunk expressive investment (the tier-mark and node-feature *geometry* and its redline
  decisions remain a useful authoring reference even though the SVGs are retired). The
  irreducibly-bespoke marks (tiers, ring, node-feature, states) still require careful
  in-family authoring and must each re-pass the 14px grayscale gate. Two icon
  dependencies must be tracked for updates.
- **Risks.** Adopted Phosphor doc-type/event marks may collide under the 14px squint test
  and need light re-authoring; the texture-generation path for Phosphor SVGs must be
  proven against the `GlyphTextureProvider` seam during implementation; weight choices must
  stay disciplined so the detail/primary/accent hierarchy reads consistently.
- **Pathways opened.** A maintained framework makes adding new chrome and doc-type marks
  cheap; the weight/fill axes give a consistent vocabulary for emphasis and state across
  the whole product; the shared `currentColor` + token-layer approach keeps icons
  theme-correct for free across dark, light, and high-contrast.

## Codification candidates

- **Rule slug:** `icons-come-from-the-two-sanctioned-families`.
  **Rule:** Structural chrome icons come from Lucide and expressive/domain marks from
  Phosphor (or are authored in-family on Phosphor's grid); no third icon set is
  introduced, and every domain mark passes the 14px grayscale-by-shape gate before it
  ships. (Candidate; promote only after it has held across one full execution cycle.)
