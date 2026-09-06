---
tags:
  - '#adr'
  - '#design-system-consolidation'
date: '2026-09-05'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:561748bc5882ffa3e9b54088a893c006338dd4fb480ca3116d00e10040b99c45'
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

# `design-system-consolidation` adr: `critical-foundation consolidation with ledgered follow-on debt` | (**status:** `accepted`)

## Problem Statement

Vaultspec Dashboard already has an accepted visual language, generated token foundation, centralized React kit, shared state treatments, responsive shell, and production verification surfaces. The remaining problem is fragmented ownership across those foundations: reusable controls and visual recipes are still implemented in settings wrappers, stores, chrome, platform fallbacks, and feature surfaces; valid relative values do not always resolve to a shared semantic role; and the review tooling does not yet support the bounded completion claim this campaign needs.

This ADR authorizes a behavior-preserving consolidation of the frontend's critical ownership foundations. Campaign completion is limited to the enforceable inventory and ratchet, the already-established field and textarea contracts, the public kit boundary, settings-control ownership, correction of store-to-kit dependency inversion, separation of platform error containment from app presentation, truthful review documentation, and bounded closeout evidence.

The classified inventory remains the authoritative account of broader adoption and value-centralization opportunities, but classification does not make every candidate a prerequisite for this campaign's completion. Consumer migrations outside settings, speculative primitive expansion, token promotion, modal-infrastructure deduplication, and exhaustive review-harness coverage remain explicit follow-on debt unless separately authorized.

This is not a redesign. It does not reopen the accepted palette, typography, density, information architecture, graph language, theme model, or product semantics. Figma capture, parity, and reconciliation are outside this campaign. Shipped code and runtime behavior form the bounded migration baseline, while Figma remains design authority. The campaign may centralize only the critical ownership boundaries named above; it may not invent visual values, states, or semantics.

## Considerations

- The accepted language and adoption decisions already settle theme generation, semantic token remapping, visual character, density, and the shared DOM-to-scene token seam. This ADR consolidates their implementation rather than redefining them. Grounding: `2026-06-14-dashboard-design-language-adr`, `2026-06-14-dashboard-design-adoption-adr`.
- The accepted frontend rewrite establishes a centralized-kit rule and freezes the stores and scene contracts beneath view work. Its Figma-parity procedure is historical context, not part of this campaign's verification claim. Grounding: `2026-06-16-figma-frontend-rewrite-adr`.
- The accepted naming contract binds shipped component names to design-system names. New code-only primitives require an explicit, ledgered campaign exception until later design reconciliation. Grounding: `2026-06-27-figma-naming-contract-adr`.
- Relative-unit migration requires value-preserving treatment and recognizes that exact local geometry can be legitimate. Consolidation therefore cannot be a nearest-token replacement exercise. Grounding: `2026-06-19-relative-units-migration-adr`.
- Shared state-mode work establishes the pattern of one reusable owner composed by every surface. This campaign extends that ownership discipline without reopening the four-mode vocabulary or behavior. Grounding: `2026-06-25-state-mode-uniformity-adr`.
- Canonical-home remediation requires direct consumption and same-change deletion; aliases, wrappers, and compatibility facades perpetuate split ownership. Grounding: `2026-08-01-code-deduplication-adr`.
- The authored-state review desk proves appearance, not live-wire reachability, and its state model does not itself provide a viewport axis. Completion needs authored-state evidence and separate runtime evidence. Grounding: `2026-07-31-visual-review-authored-states-adr`.
- The concrete ownership gaps, candidate migration families, layer leak, and verification gaps are grounded in `2026-09-05-design-system-consolidation-horizontal-polish-research` and `2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference`.
- The native-control and relative-value inventories classify candidates rather than proving that every candidate is a present defect. Their durable value is truthful ownership and debt tracking, not a zero-native-control or zero-local-value target. Grounding: `2026-09-05-design-system-consolidation-horizontal-polish-research`, `2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference`.
- Completion evidence must be proportional to the production boundaries changed. A bounded runtime pass can establish the settings, kit-boundary, and error-fallback result without requiring a permanent exhaustive matrix or migration of unrelated surfaces.

## Considered options

1. **Token-only cleanup.** Normalize values while leaving the known settings, import-boundary, store-layer, and platform-presentation violations in place. This does not resolve the critical ownership defects. Rejected.
2. **Complete every classified migration before closure.** Execute all ordinary-field, textarea, option-row, icon-action, token-promotion, modal, and review-harness work in one campaign. This maximizes adoption but treats classified opportunities as mandatory defects, expands regression surface without a demonstrated foundation need, and encourages work for completion-count rather than product value. Rejected as the campaign completion criterion.
3. **Critical-foundation consolidation with ledgered follow-on debt.** Complete the enforceable ownership substrate, base public contracts, settings migration, import and layer correction, platform/app error separation, and bounded closeout evidence; retain the broader inventory as explicit follow-on debt. Chosen.
4. **Independent surface polish.** Improve screens locally without enforcing canonical ownership. This preserves the fragmentation the campaign exists to correct. Rejected.
5. **Visual redesign or Figma-parity campaign.** Reconcile surfaces against external design artifacts and permit broader visual or behavioral change. This exceeds scope and reopens settled decisions. Rejected for this campaign.

## Constraints

The stores, wire/model contracts, query behavior, `SceneController` contract, scene behavior, graph semantics, filtering semantics, responsive mode selection, and feature behavior are frozen. Moving a visual mapping or class recipe out of a store is permitted; changing the state, value policy, serialized value, selector semantics, or user-visible behavior it represents is not.

Layer direction remains binding. Stores may expose state, domain meaning, and value policy, but may not import app-kit types or emit CSS recipes. The app maps semantic state to kit presentation. The platform layer may own generic containment, diagnostics, and reset mechanics, but may not import the app kit or become a second product visual system.

Public CSS token names and the root token surface consumed through `getComputedStyle` remain compatible. Every scene-read color continues to be emitted as literal per-theme hex. Token extraction, aliasing, and promotion require before-and-after computed-value equality in light, dark, and high-contrast themes; nearest-token snapping and newly invented values are prohibited. The campaign does not convert scene rendering values to DOM units, alter scene paint, or touch unrelated in-flight graph and scene work.

All DOM styling remains relative-unit compliant. Consolidation must preserve exact geometry when a token substitution would change behavior or composition without a shared semantic reason.

A migration is incomplete until consumers import the canonical owner directly and the superseded implementation, alias, style recipe, and migration-only comment are removed in the same wave. Compatibility facades, forwarding wrappers, parallel primitives, and surface-specific theme forks are prohibited.

That rule binds every migration this campaign actually executes; it does not convert every classified candidate into a completion prerequisite. Deferred candidates remain truthful ledger entries with their intended canonical owner and rationale. They are neither marked migrated nor reclassified as intentional seams merely to obtain a clean closeout.

Figma is not consulted for capture, inspection, parity comparison, reconciliation, or acceptance evidence in this campaign. This scope fence does not supersede prior authority records; it limits what this ADR claims and what its execution may use as proof. Every code-only token or component structure without a confirmed design-system name or node is recorded as campaign-scoped parity debt for later reconciliation.

## Implementation

The canonical ownership map is:

1. **DTCG owns repository and runtime generation of reusable values.** Figma remains design authority. Foundation tokens own application-wide color, typography, spacing, radius, elevation, and motion roles already present in the shipped system. Component tokens own stable shipped values that belong to one canonical primitive or composite but must remain shared across its instances, states, themes, or responsive treatments. Generated regions remain generator-owned, and the runtime stylesheet remains the ordered carrier of the public token surface.
2. **`app/kit` owns reusable visual and interactive primitives.** Buttons, icon actions, fields, textareas, switches, sliders, segmented controls, list or option rows, activity and state treatments, and future equivalent base elements live here. The kit owns their visual states, accessible labeling contract, focus treatment, disabled treatment, semantic size variants, and theme consumption. Its public barrel is the production import boundary. A new export such as `TextField` or `TextArea` must reuse a valid existing design-system name or alias when one is already grounded; otherwise it is a temporary, ledgered exception to the naming contract and creates no claim that design parity is satisfied.
3. **Shared chrome owns shell composites and interaction infrastructure.** Dialog and sheet framing, focus-zone behavior, overlay dismissal and placement, shell regions, responsive chrome, coarse-pointer policy, and other application-level composites live in shared chrome when they are not general-purpose primitives. Chrome composes kit primitives and owns no competing base-element vocabulary.
4. **Surfaces own feature composition.** Feature surfaces arrange canonical primitives and composites around feature-specific data and intent. A native element may remain inside a canonical semantic composite when the element is integral to that composite's behavior and no existing primitive expresses it. Such a seam is classified and retained intentionally; it is not used as precedent for parallel base styling.
5. **Stores own state and value policy.** Stores expose stable semantic data, schema interpretation, selection, and wire conversion. They do not return class strings, visual tone types, or app-kit contracts. The existing facet-tone dependency is corrected by keeping semantic filter state below the app boundary and mapping it to `FacetDotTone` in app composition.

The ownership map is normative beyond this campaign, but the completion boundary is narrower than universal adoption. This campaign completes only:

1. The classified ledger, frozen scene baseline, enforcement scanner, fixtures, and lint integration.
2. The already-landed `TextField` and `TextArea` contracts, a pinned shipped `ActivityIndicator` contract, the required naming-debt entries, and the public kit barrel.
3. Direct settings composition from `Switch`, `Slider`, `SegmentedToggle`, `Segment`, and `TextField`, with CSS recipes removed from stores while wire-value policy remains unchanged.
4. Production import normalization through the kit barrel and removal of all lower-layer dependencies on app-kit presentation contracts.
5. App-owned localized error presentation composed from kit primitives, with platform retaining only containment, diagnostics, reset, retry coordination, and injected rendering.
6. Correction of the authored-review command's false viewport claim, followed by ledger reconciliation, ratchet tightening, bounded runtime evidence, final audit, and byte-for-byte scene-contract proof.

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

Ordinary field and textarea adoption outside settings, a new `OptionRow`, new `IconButton` variants, broad menu and icon-action migrations, reusable motion or dimension promotion into DTCG, stylesheet restructuring, modal-surface consolidation, exhaustive authored-specimen completion, and a permanent automated theme-by-viewport matrix are follow-on work. The ledger preserves these opportunities and their intended owners; this ADR does not claim they were implemented or that their remaining duplication was eliminated.

Stylesheet organization may be split along generator, reader, integration, accessibility, or infrastructure ownership seams only when the public token surface, import order, Tailwind discovery, generated markers, and computed cascade are proven unchanged. File splitting is not itself a success criterion.

Every green wave runs full `just lint frontend`, its touched type, unit, accessibility, and interaction tests, and an ownership scan proving removal of the replaced path. Full `just test frontend` runs before each phase review and final acceptance; full Vitest suites are never run concurrently. Visual verification covers authored normal, loading, empty, and degraded states where applicable in light, dark, and high-contrast themes. Separate runtime passes cover representative wide and intermediate widths within the supported `regular` viewport class plus a representative `compact` width, including keyboard navigation, focus visibility, pointer and coarse-pointer affordances, overlay placement and dismissal, and live-wire behavior. Only `regular` and `compact` are supported viewport classes; this ADR authorizes neither a new responsive mode nor a visual-review-desk viewport axis.

Final acceptance requires all critical-boundary work to be independently reviewed and closed; a truthful ledger and ratchet covering both completed work and deferred debt; zero production kit-submodule imports; zero store or platform dependencies on app kit; settings stores free of CSS recipes; generic platform error containment with app-owned production presentation; corrected review documentation; full `just lint frontend`; one serialized full `just test frontend`; a bounded runtime pass in light, dark, and high-contrast at representative regular-wide, regular-intermediate, and compact widths; byte-for-byte equality of frozen scene sources and the `SceneController` contract; and a final audit with no CRITICAL or HIGH findings inside the accepted boundary.

The runtime pass covers changed settings controls, keyboard operation, visible focus, app and region error fallbacks, retry and reload actions, and responsive reachability. It records commands, exact widths, themes, responsive classes, and outcomes in a durable receipt. Permanent exhaustive automation, a confirmation pass, token-computed-value evidence where no token changed, and Figma-parity evidence are not completion requirements.

## Rationale

The narrowed boundary wins because it closes the defects that weaken future work: unenforced ownership, an incomplete public kit contract, settings-owned primitive duplication, stores emitting presentation, production deep imports, and platform-owned product styling. Once those are corrected, the remaining inventory is visible, classified, and prevented from worsening.

Requiring every classified migration would confuse an opportunity ledger with a defect list. Broad field, option-row, icon-action, token, modal, and review-harness work carries meaningful regression and maintenance cost but is not necessary to establish the canonical foundation. Deferring it preserves the accepted direction without manufacturing implementation work merely to close rows.

The bounded verification model is sufficient for the changed boundary: focused tests establish contracts, the full frontend gates catch integration regressions, runtime evidence exercises the affected user paths across supported themes and widths, and the immutable scene comparison proves non-interference.

## Consequences

The frontend gains an enforceable ownership substrate, a complete public base-kit boundary for the primitives established by the critical campaign, settings controls composed from canonical owners, corrected app/store dependency direction, and a clean platform/app error-presentation boundary. Future work can adopt these owners without first solving foundational ambiguity.

The campaign deliberately leaves adoption debt. `TextField` and `TextArea` may remain public before broad consumer migration. Option and icon-action duplication remains. Exact motion and dimension values remain hand-authored but ledgered. Dialog and sheet interaction mechanics remain duplicated. Authored-review completeness remains informative rather than globally gating. These are accepted follow-on risks, not claims of completed consolidation.

The ledger must continue to report deferred candidates truthfully. Closeout may not erase migration intent, relabel duplication as a semantic seam without evidence, or claim zero native controls, zero arbitrary values, exhaustive visual coverage, token centralization, modal consolidation, or Figma parity.

No further critical foundation work is required once the acceptance conditions pass. Remaining work is optional follow-on product or maintenance investment and should proceed only when its value justifies the regression surface.
