---
tags:
  - '#research'
  - '#relative-units-migration'
date: '2026-06-19'
modified: '2026-06-22'
related: []
---

# `relative-units-migration` research: `px-to-relative units migration`

This research scopes a campaign to eliminate every hardcoded pixel value from the
frontend's CSS and styling and migrate it to relative units (rem at the established
16px basis), as a hard mandate: the shipped implementation must carry no absolute
`px` in CSS/layout/sizing/spacing/margins, with relative units always preferred.

Three questions framed the work: whether Figma supports relative values, whether the
binding designs themselves use relative values or hardcode px, and whether Figma
offers a usable px-to-relative translation path. Beyond those, it inventories the
actual frontend migration surface and the scene/canvas deferral, so the decision and
plan that follow are grounded in measured counts rather than assumption. It builds
directly on the binding-Figma authority direction and the existing DTCG token
pipeline established by the figma-parity-reconciliation cycle.

## Findings

### F0 — The foundation is already relative; this campaign closes the gap above it

The non-color foundation token families are already authored and emitted in **rem**
at a **16px basis**, not px. The DTCG sources (`frontend/tokens/spacing.tokens.json`,
`type.tokens.json`, `radius.tokens.json`) carry rem `$value`s (e.g. spacing `4px`
is stored as `0.25rem`, `display` type is `1.25rem/1.75rem`, radius `xs` is
`0.25rem`), and Style Dictionary emits them into the CLI-managed region of
`frontend/src/styles.css` as `--spacing-fg-*`, `--text-fg-*`, `--radius-fg-*` rem
custom properties, registered into Tailwind as `gap-fg-*`, `px-fg-*`, `text-body`,
`rounded-fg-md`, etc. So the migration is not "build a relative token system" — it
is "drive the remaining hardcoded px in the *implementation* onto the relative scale
that already exists, and close the few gaps where no token yet fits."

### F1 — Does Figma support relative values? No, not as units

Figma's model is numeric pixels for every geometric property — width, height, x/y,
auto-layout gap and padding, corner radius, stroke weight, and font size. Variables
of type `number` are likewise unitless/numeric and render as px. Figma has **no
concept of a root font size**, so there is no rem and no em. The only genuinely
relative typographic units Figma exposes are **percentage line-height** and
**percentage letter-spacing** (relative to the element's own font size).

What Figma offers in place of relative units is **constraint-based responsiveness**,
which is a different mechanism: Auto Layout resizing modes (Fill container / Hug
contents / Fixed), pin/scale constraints on absolutely positioned children, and
min/max width and height. These make a frame respond to its container; they do not
make a value relative to a root. The practical consequence: Figma can express a
responsive *layout intent*, but it cannot express a value *as* a relative unit.

### F2 — Do the actual designs use relative values, or hardcode px? They hardcode px

The binding Figma file hardcodes px — it has no other option, per F1. This is
confirmed in-repo: every DTCG token documents its px origin in its `$description`
(`spacing "1" = 4px (base step)`, `type display = 20/28`, `radius sm = 5px`), and
the rem form is produced entirely on the **code side**. The Tokens Studio bridge
that this project pushes back *to* Figma (`frontend/tokens/figma/tokens.json`)
carries rem strings, but when Tokens Studio applies those to the live file Figma
stores and renders them as px against its configured base. The authoritative
direction is therefore: **Figma is the binding px source; rem is a code-side
projection** — consistent with the standing rule that Figma is the binding source
of truth for design and code mirrors it.

### F3 — Does Figma give a usable px-to-relative translation path? Yes, but downstream of Figma — and it is already wired

Figma has no in-app px-to-rem feature. The canonical translation happens at the
**token export / build layer**, and this project already runs it: the DTCG sources
are authored in rem at the 16px basis, Style Dictionary transforms them into the
`:root` CSS custom properties and the Tailwind `@theme` registration, and a CI drift
gate fails the build when generated CSS diverges from committed output. The Tokens
Studio bridge (`frontend/tokens/figma/tokens.json`) round-trips the same families
for Figma verification. So the px-to-relative path is a solved, mechanical,
build-time transform for the foundation families; the campaign's job is to extend
its *reach* — to ensure every implementation value flows through it rather than
being typed inline.

### F4 — The frontend migration surface (measured)

The hardcoded px that remains lives in the implementation that bypasses the token
scale, not in the foundation:

- **Tailwind arbitrary `[Npx]` values in `*.tsx` — ~73 occurrences across ~20
  files.** This is the prime target. They are both *off-scale* and *hardcoded px*:
  `gap-[11px]`, `gap-[7px]`, `px-[72px]`, `px-[10px]`, `text-[13.5px]`,
  `text-[11px]`, `h-[29px]`, `w-[248px]`, `top-[34px]`, `w-[calc(100%-64px)]`.
  Concentrated in the timeline (`TimelineControls.tsx`, `Timeline.tsx`,
  `Minimap.tsx`), the viewer (`MarkdownReader.tsx`), the left rail
  (`TreeBrowser.tsx`, `LeftRail.tsx`, `CodeTree.tsx`), and the kit
  (`DocRow.tsx`, `FacetRow.tsx`, `SearchField.tsx`).
- **`frontend/src/styles.css` hand-authored literals — ~31 occurrences.** Mixed:
  box-shadow offset/blur geometry, 1px hairline borders, letter-spacing
  (`0.6px`, `-0.3px`), a few radius literals (`10px`, `5px`, `2px`), small transform
  offsets (`translateY(6px)`), and the dockview integration custom properties
  (`--dv-*: 34px/6px`). The CLI-managed token region of this file is already rem and
  is owned by the pipeline — it is out of hand-edit scope (regenerate, never edit
  between the markers).
- **`*.ts` — ~117 occurrences, but mostly NOT CSS.** These are scene/canvas render
  coordinates (camera zoom, node sprite sizes, edge widths, mark geometry, quadtree
  `spaceSize`, hit radii), timeline layout math, and test fixtures. They are device-
  pixel render-space values, not stylesheet declarations.

### F5 — Edge cases and the resolved policy (user decisions)

Three cases collide with an absolute "zero px" reading; the user has ruled on each:

- **Hairline borders (1px) and box-shadow geometry (offset/blur).** Conventionally
  kept in px because rem borders/shadows can sub-pixel-blur at non-integer device
  pixel ratios. **Decision: convert everything to rem anyway** (`1px` to `0.0625rem`,
  shadow geometry in rem) so they scale with UI zoom; the minor sub-pixel-blur risk
  is accepted and verified visually.
- **Off-scale ad-hoc values** (`gap-[11px]`, `text-[13.5px]`, `px-[72px]`).
  **Decision: snap to the nearest rem token; where no token fits, add a token to the
  DTCG source** so Figma remains the binding source rather than minting a code-only
  one-off. This accepts that a few values shift by a pixel or two to land on the
  scale.
- **Letter-spacing and percentage-style metrics.** Letter-spacing is naturally
  em-relative (it scales with font size); the migration prefers `em` for
  letter-spacing and rem for everything geometric.

### F6 — The scene/canvas layer: relative units are undefined there, so it is deferred

A WebGL canvas has no root font size, so rem/em are undefined in scene render-space:
PixiJS/three.js coordinates are device pixels by construction. The legacy cosmos
renderer is retired; the **live production graph surface is being migrated to
three.js by a parallel agent team**. The user's intent is to eventually enrol the
canvas into proper **UI font/zoom scaling** (so the graph scales with the rest of the
UI), but this is a *feature to build with the three.js graph*, not a find-and-replace.
**Decision: defer the scene/canvas px migration until all other React front-end and
back-end relative-unit work is complete**, then implement canvas scaling as a
deliberate feature that reads the computed root scale and multiplies render-space px
by the rem ratio. Until then, scene/canvas px is an accepted, documented divergence —
and the campaign must coordinate with the parallel three.js migration to avoid
contending the same files. Test fixtures and pure layout math in `*.ts` are likewise
out of CSS scope.

### Recommended approach

A layered migration that respects the existing pipeline and the four-layer ownership
boundary:

1. **Tooling first.** Add an ESLint/stylelint guard (or a CI grep gate) that fails on
   a hardcoded `px` in CSS/`*.tsx` arbitrary values, scoped to exclude the
   scene/canvas layer, test fixtures, and the CLI-managed token region. This makes
   the mandate structural rather than vigilance-based and prevents regression.
2. **Token gaps.** Reconcile the off-scale values against the DTCG scale; add the
   handful of missing tokens to the DTCG sources (regenerated, not hand-edited),
   keeping Figma the binding source.
3. **Surface-by-surface migration.** Convert the `[Npx]` Tailwind values and
   `styles.css` literals per surface (timeline, viewer, left rail, kit, shell),
   snapping to tokens or rem, with visual parity verification per surface.
4. **Scene/canvas deferred feature.** After the DOM surfaces are clean, build canvas
   UI-scaling with the three.js graph, in coordination with the parallel team.

### Risks and open questions

- **Visual drift from snapping.** Snapping off-scale values to the token scale shifts
  a few pixels; needs per-surface visual-parity verification against Figma.
- **Sub-pixel blur** on rem borders/shadows at fractional DPR — accepted per F5,
  verify on a HiDPI display.
- **Contention with the parallel three.js team** on scene files — the deferral and
  coordination in F6 is the mitigation; the DOM campaign must not edit scene render
  math.
- **Open:** Should the CI guard be a lint rule (richer, scoped) or a simple grep gate
  (cheaper, blunter)? To be settled in the ADR.
- **Open:** Is the 16px basis ever themeable (user-facing text-size preference)? If
  so, the rem migration is also the enabler for a global UI-scale setting — worth
  naming in the ADR as a downstream benefit.
