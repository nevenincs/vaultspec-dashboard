---
tags:
  - '#adr'
  - '#design-system-consolidation'
date: '2026-09-05'
modified: '2026-09-05'
body_schema: 'body-v2'
body_hash: 'sha256:9eb14df0270ca9c3a97c4022f623a0fb2517daa01c3cb8dfd4c8e906c9e4e21a'
related:
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-19-relative-units-migration-adr]]"
  - "[[2026-08-01-code-deduplication-adr]]"
  - '[[2026-06-14-dashboard-design-adoption-adr]]'
  - '[[2026-06-16-figma-frontend-rewrite-adr]]'
  - '[[2026-06-27-figma-naming-contract-adr]]'
  - '[[2026-06-25-state-mode-uniformity-adr]]'
  - '[[2026-07-31-visual-review-authored-states-adr]]'
---

# `design-system-consolidation` adr: `behavior-preserving horizontal design-system consolidation` | (**status:** `accepted`)

## Problem Statement

Vaultspec Dashboard already has an accepted visual language, generated token foundation, centralized React kit, shared state treatments, responsive shell, and production verification surfaces. The remaining problem is fragmented ownership across those foundations: reusable controls and visual recipes are still implemented in settings wrappers, stores, chrome, platform fallbacks, and feature surfaces; valid relative values do not always resolve to a shared semantic role; and the review tooling does not yet support the bounded completion claim this campaign needs.

This ADR authorizes a behavior-preserving horizontal consolidation of the shipped frontend. It establishes one canonical owner for each reusable value, primitive, composite, and presentation responsibility; migrates consumers directly to those owners; removes the implementations they replace; and verifies the result across supported themes, states, and viewport classes.

This is not a redesign. It does not reopen the accepted palette, typography, density, information architecture, graph language, theme model, or product semantics. Figma capture, parity, and reconciliation are outside this campaign. Shipped code and runtime behavior form the bounded migration baseline, while Figma remains design authority. The campaign may extract, centralize, or alias shipped values and behavior; it may not invent visual values, states, or semantics. Any required design choice stops this campaign and moves to a separately authorized, Figma-backed decision.

## Considerations

- The accepted language and adoption decisions already settle theme generation, semantic token remapping, visual character, density, and the shared DOM-to-scene token seam. This ADR consolidates their implementation rather than redefining them. Grounding: `2026-06-14-dashboard-design-language-adr`, `2026-06-14-dashboard-design-adoption-adr`.
- The accepted frontend rewrite establishes a centralized-kit rule and freezes the stores and scene contracts beneath view work. Its Figma-parity procedure is historical context, not part of this campaign's verification claim. Grounding: `2026-06-16-figma-frontend-rewrite-adr`.
- The accepted naming contract binds shipped component names to design-system names. New code-only primitives require an explicit, ledgered campaign exception until later design reconciliation. Grounding: `2026-06-27-figma-naming-contract-adr`.
- Relative-unit migration requires value-preserving treatment and recognizes that exact local geometry can be legitimate. Consolidation therefore cannot be a nearest-token replacement exercise. Grounding: `2026-06-19-relative-units-migration-adr`.
- Shared state-mode work establishes the pattern of one reusable owner composed by every surface. This campaign extends that ownership discipline without reopening the four-mode vocabulary or behavior. Grounding: `2026-06-25-state-mode-uniformity-adr`.
- Canonical-home remediation requires direct consumption and same-change deletion; aliases, wrappers, and compatibility facades perpetuate split ownership. Grounding: `2026-08-01-code-deduplication-adr`.
- The authored-state review desk proves appearance, not live-wire reachability, and its state model does not itself provide a viewport axis. Completion needs authored-state evidence and separate runtime evidence. Grounding: `2026-07-31-visual-review-authored-states-adr`.
- The concrete ownership gaps, candidate migration families, layer leak, and verification gaps are grounded in `2026-09-05-design-system-consolidation-horizontal-polish-research` and `2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference`.

## Considered options

1. **Token-only cleanup.** Normalize values while leaving duplicate React primitives and interaction behavior in place. This has a small blast radius but does not resolve split control ownership, store-owned styling, or surface drift. Rejected.
2. **Independent surface polish.** Improve each screen locally and consolidate only when duplication becomes inconvenient. This can produce fast local gains, but it keeps base-element ownership ambiguous and repeats accessibility, state, and theme work. Rejected.
3. **Behavior-preserving horizontal consolidation.** Establish canonical owners, migrate equivalent families in bounded waves, delete replaced implementations, and verify both authored appearance and live behavior. Chosen.
4. **Visual redesign or Figma-parity campaign.** Reconcile every surface against external design artifacts and permit broader visual or behavioral change. This exceeds the requested scope and would reopen settled decisions without a demonstrated foundation defect. Rejected for this campaign.

## Constraints

The stores, wire/model contracts, query behavior, `SceneController` contract, scene behavior, graph semantics, filtering semantics, responsive mode selection, and feature behavior are frozen. Moving a visual mapping or class recipe out of a store is permitted; changing the state, value policy, serialized value, selector semantics, or user-visible behavior it represents is not.

Layer direction remains binding. Stores may expose state, domain meaning, and value policy, but may not import app-kit types or emit CSS recipes. The app maps semantic state to kit presentation. The platform layer may own generic containment, diagnostics, and reset mechanics, but may not import the app kit or become a second product visual system.

Public CSS token names and the root token surface consumed through `getComputedStyle` remain compatible. Every scene-read color continues to be emitted as literal per-theme hex. Token extraction, aliasing, and promotion require before-and-after computed-value equality in light, dark, and high-contrast themes; nearest-token snapping and newly invented values are prohibited. The campaign does not convert scene rendering values to DOM units, alter scene paint, or touch unrelated in-flight graph and scene work.

All DOM styling remains relative-unit compliant. Consolidation must preserve exact geometry when a token substitution would change behavior or composition without a shared semantic reason.

A migration is incomplete until consumers import the canonical owner directly and the superseded implementation, alias, style recipe, and migration-only comment are removed in the same wave. Compatibility facades, forwarding wrappers, parallel primitives, and surface-specific theme forks are prohibited.

Figma is not consulted for capture, inspection, parity comparison, reconciliation, or acceptance evidence in this campaign. This scope fence does not supersede prior authority records; it limits what this ADR claims and what its execution may use as proof. Every code-only token or component structure without a confirmed design-system name or node is recorded as campaign-scoped parity debt for later reconciliation.

## Implementation

The canonical ownership map is:

1. **DTCG owns repository and runtime generation of reusable values.** Figma remains design authority. Foundation tokens own application-wide color, typography, spacing, radius, elevation, and motion roles already present in the shipped system. Component tokens own stable shipped values that belong to one canonical primitive or composite but must remain shared across its instances, states, themes, or responsive treatments. Generated regions remain generator-owned, and the runtime stylesheet remains the ordered carrier of the public token surface.
2. **`app/kit` owns reusable visual and interactive primitives.** Buttons, icon actions, fields, textareas, switches, sliders, segmented controls, list or option rows, activity and state treatments, and future equivalent base elements live here. The kit owns their visual states, accessible labeling contract, focus treatment, disabled treatment, semantic size variants, and theme consumption. Its public barrel is the production import boundary. A new export such as `TextField` or `TextArea` must reuse a valid existing design-system name or alias when one is already grounded; otherwise it is a temporary, ledgered exception to the naming contract and creates no claim that design parity is satisfied.
3. **Shared chrome owns shell composites and interaction infrastructure.** Dialog and sheet framing, focus-zone behavior, overlay dismissal and placement, shell regions, responsive chrome, coarse-pointer policy, and other application-level composites live in shared chrome when they are not general-purpose primitives. Chrome composes kit primitives and owns no competing base-element vocabulary.
4. **Surfaces own feature composition.** Feature surfaces arrange canonical primitives and composites around feature-specific data and intent. A native element may remain inside a canonical semantic composite when the element is integral to that composite's behavior and no existing primitive expresses it. Such a seam is classified and retained intentionally; it is not used as precedent for parallel base styling.
5. **Stores own state and value policy.** Stores expose stable semantic data, schema interpretation, selection, and wire conversion. They do not return class strings, visual tone types, or app-kit contracts. The existing facet-tone dependency is corrected by keeping semantic filter state below the app boundary and mapping it to `FacetDotTone` in app composition.

Values and patterns are promoted by semantic ownership, not frequency alone:

- Use an existing foundation or component token only when its semantic role and exact computed value match in light, dark, and high-contrast themes.
- Add a foundation token when an existing shipped value represents a reusable application-wide role across independent component families, preserving exact computed values in every theme.
- Add a component token when an existing shipped value is shared by instances or states of one canonical primitive or composite and is expected to change with that owner, again preserving exact computed values in every theme.
- Add or extend a React primitive only when at least two consumers have behaviorally equivalent semantics, interaction states, accessibility obligations, and visual change cadence.
- Preserve a local relative value or native seam when it expresses exact feature geometry, renderer coordination, third-party integration, or a genuinely singular semantic contract. Non-obvious exceptions are documented at their canonical owner and included in the classification ledger.
- Similar-looking controls with different behavior are not merged into a universal polymorphic component.

Motion follows the accepted interaction grammar. Existing reusable durations and easing roles may move into DTCG only with exact before-and-after computed-value equality; primitive-specific state transitions belong to the kit; shell and overlay transitions belong to chrome. Keyboard-initiated actions remain immediate, reduced-motion behavior remains authoritative, and no ambient decorative motion is introduced.

Shell dimensions, touch targets, and overlay infrastructure are centralized according to ownership rather than scattered through surfaces. Stable reusable dimensions become component tokens. Kit controls own their target sizing and coarse-pointer variants; chrome owns shell geometry, overlay stacking, focus containment, dismissal, and placement. Feature surfaces may configure these contracts but may not restyle their foundations independently.

`ErrorBoundary` remains a platform containment mechanism responsible for catching, reporting, resetting, and retry coordination. Product presentation moves to an app-owned boundary wrapper that injects a fallback renderer composed from kit primitives and localized app copy. Every production boundary uses that wrapper or supplies an app-owned renderer explicitly. Platform does not import the kit and does not retain a parallel styled fallback.

The migration proceeds in bounded waves: first settings controls and store-owned visual recipes; then ordinary fields, textareas, option rows, and icon actions; then import normalization and layer-leak correction; then value classification and token promotion; then platform fallback composition and shared chrome; then review-harness coverage and documentation. Specialized search, code-editing overlays, graph controls, timeline handles, tree rows, checkboxes, date controls, and other semantic composites are inspected individually and migrate only when their contracts exactly match a canonical owner.

Stylesheet organization may be split along generator, reader, integration, accessibility, or infrastructure ownership seams only when the public token surface, import order, Tailwind discovery, generated markers, and computed cascade are proven unchanged. File splitting is not itself a success criterion.

Every green wave runs full `just lint frontend`, its touched type, unit, accessibility, and interaction tests, and an ownership scan proving removal of the replaced path. Full `just test frontend` runs before each phase review and final acceptance; full Vitest suites are never run concurrently. Visual verification covers authored normal, loading, empty, and degraded states where applicable in light, dark, and high-contrast themes. Separate runtime passes cover representative wide and intermediate widths within the supported `regular` viewport class plus a representative `compact` width, including keyboard navigation, focus visibility, pointer and coarse-pointer affordances, overlay placement and dismissal, and live-wire behavior. Only `regular` and `compact` are supported viewport classes; this ADR authorizes neither a new responsive mode nor a visual-review-desk viewport axis.

Final acceptance requires full `just lint frontend` and `just test frontend`, token and relative-unit guards, domain and module boundary checks, review-specimen completeness checks, exact computed-value evidence for token changes across all three themes, a final native-control and arbitrary-value classification scan, bounded runtime evidence for all supported themes and both viewport classes, a ledger of naming/parity debt, and an evidence-backed audit that distinguishes authored appearance from live reachability.

## Rationale

Behavior-preserving horizontal consolidation is the only option that closes the ownership defects without reopening a settled visual system or increasing architectural blast radius. It applies the canonical-home and same-wave-deletion discipline from `2026-08-01-code-deduplication-adr` to frontend presentation, while preserving the theme, token, relative-unit, state-mode, and scene compatibility decisions already accepted.

The ownership map gives every reusable concern one place to evolve. DTCG governs values, the kit governs base controls, chrome governs shell-level interaction infrastructure, surfaces govern feature composition, and stores remain free of visual implementation. The promotion rule avoids both failure extremes: repeated magic values and controls do not remain scattered, while singular geometry and semantic composites are not distorted merely to satisfy a token or primitive count.

Injected app fallbacks resolve the platform error-boundary conflict without reversing layer direction or creating a second visual kit. Direct migration with same-wave deletion prevents the consolidation campaign from leaving transitional APIs as permanent authorities.

The combined verification model matches the evidence each mechanism can honestly provide: authored specimens prove appearance, live-wire tests prove reachability and behavior, and bounded runtime passes prove responsive and interaction quality. The no-Figma fence keeps that claim precise while leaving prior long-term authority decisions untouched.

## Consequences

The frontend gains one enforceable ownership model for variables, CSS roles, primitives, shell composites, and surface composition. Settings and feature surfaces inherit consistent focus, disabled, keyboard, pointer, theme, and accessibility behavior. Store and platform boundaries become clearer, and future visual changes have fewer independent implementation sites.

The work has broad but controlled reach. Direct migration may alter component APIs, snapshots, and test fixtures even though user-visible behavior is frozen. Token promotion and stylesheet extraction require cascade-sensitive review. Some apparent duplication will remain intentionally where semantic composites differ, so the final state is a classified system rather than a zero-native-element or zero-local-value target.

The campaign incurs ongoing maintenance obligations: new primitives must enter through the kit, reusable values through DTCG, chrome infrastructure through shared chrome, and exceptions must remain narrow and reviewable. Review-specimen coverage and runtime viewport evidence become part of frontend completion rather than optional polish.

No Figma parity conclusion follows from this work. Any future reconciliation against external design artifacts is a separate authorized campaign with its own evidence and decision record.
