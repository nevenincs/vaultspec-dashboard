---
tags:
  - '#adr'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
  - '[[2026-06-14-dashboard-design-language-research]]'
---



# `dashboard-design-adoption` adr: `design language adoption cycle` | (**status:** `accepted`)

## Problem Statement

The two grounding design ADRs - the base design-language ADR and the iconography ADR -
are spec work that deliberately defer their own implementation to a later adoption cycle.
That adoption cycle is a feature in its own right: it rebuilds the token layer in OKLCH
and re-skins every surface. The framework lifecycle expects a plan to be backed by an ADR
under the same feature tag, but the adoption work was planned under a fresh feature tag
without a same-feature decision record. This ADR is that record. It does not reopen or
re-decide anything; it pins the decision to execute the adoption against the two accepted
grounding ADRs and inherits every law they set.

## Considerations

The substantive design decisions live in the two authorizing ADRs and are not restated
here. This ADR exists so the adoption feature has a same-feature decision anchor for its
plan and its execution records, and so the lifecycle (research to ADR to plan to exec)
resolves for the adoption tag. The adoption is a coding cycle, not a spec cycle.

## Constraints

This ADR adds no new constraint. It is wholly subordinate to the two grounding ADRs: the
base design-language ADR (theme model, color discipline, depth/form, typography, motion,
density, the human-warmth signature, the preserved product invariants) and the
iconography ADR (the two sanctioned icon families and the bespoke domain-mark plane). The
load-bearing technical constraint they both rest on - design tokens must be readable from
JavaScript via `getComputedStyle` because the canvas scene consumes them - is honored by
the adoption work and is the reason the scene-consumed tokens stay hex-emitting.

## Implementation

The adoption proceeds as the plan sequences it: a foundation wave that replaces the
single-tier hex token block with OKLCH primitive ramps aliased by a Radix-style semantic
token tier, dark / light / high-contrast peer themes as `[data-theme]` remaps, the
Tailwind v4 `@theme static` plus `@theme inline` wiring that keeps the scene token reads
resolving, and the formalized icon dependencies; then a surface wave that carries the
language to each surface gated on each surface's own ADR; then a discretionary codify wave
that promotes the candidate rules once they have held across a cycle. The token names the
existing chrome and scene already consume are preserved so no consumer breaks; the
internal architecture beneath those names is rebuilt.

## Rationale

Pinning the adoption decision against the two accepted grounding ADRs lets the
implementation cycle proceed without reopening settled design questions, and gives the
adoption feature the same-feature ADR anchor its plan and execution records require. The
decision is to execute, not to re-decide.

## Consequences

The adoption feature now has a coherent lifecycle anchor; its plan and execution records
trace to a same-feature ADR that defers to the two grounding decisions. No design
authority is duplicated or forked. The only cost is one additional pointer document; the
gain is a lifecycle that resolves cleanly and an execution trail that stays attached to
its own feature tag rather than borrowing another feature's namespace.

## Codification candidates

The codification candidates for this cycle are owned by the two grounding ADRs (the base
design-language ADR names `warmth-lives-in-tokens-not-decoration` and
`themes-are-oklch-generated-from-a-token-tier`; the iconography ADR names
`icons-come-from-the-two-sanctioned-families`). This adoption ADR introduces no new
durable constraint of its own; promotion of those candidates is the codify wave's work
after they have held across one full execution cycle.
