---
name: warmth-lives-in-tokens-not-decoration
---

# Warmth lives in tokens, not decoration

## Rule

Human or tactile warmth in the dashboard UI may be expressed only through warm-hued
low-chroma neutrals, a single muted accent, soft depth and radius, purposeful
micro-interactions, and copy tone — never through textures, skeuomorphism, gradients,
multiple accents, or reduced contrast; contrast, diff legibility, density, and
reactivity override warmth on any conflict.

## Why

The base design-language ADR (`2026-06-14-dashboard-design-language-adr`) names warmth
as a token-and-principles layer, not a decorative one, and flags that without vigilance
"human touch" creeps back into decoration and erodes the clean instrument register. The
failure mode is a surface that reaches for a texture, a gradient, a second accent, or a
softened contrast to feel warmer — and silently trades away legibility, diff truth, or
density to do it. This constraint held across the full adoption cycle: every one of the
foundation, twelve surfaces, and the domain-mark plane was design-reviewed against it and
confirmed (no gradients or textures shipped; warmth stayed in the warm low-chroma
neutrals and the single earthy accent).

## How

- Good: a surface wants to feel less clinical, so it leans on the warm low-chroma neutral
  ground, the single muted accent for selection rings, and soft radius and elevation
  tokens — warmth carried entirely through the semantic token tier.
- Good: the diff browser keeps the sacred green/red at full contrast even under the warm
  theme, because diff legibility overrides warmth on conflict.
- Bad: the minimap reaching for a cold-blue second accent to differentiate itself — caught
  and removed in the foundation revision, because a second accent is decoration, not
  warmth.
- Bad: adding a subtle gradient or paper-grain texture to a panel "to soften it"; that is
  decoration the guardrail forbids, and it erodes the clean register.

## Source

Base design-language ADR `2026-06-14-dashboard-design-language-adr` (codification
candidate; the warmth guardrail in the Risks section). Held across the
`2026-06-14-dashboard-design-adoption` cycle (foundation, twelve surfaces, domain-mark
plane). Sibling rule `themes-are-oklch-generated-from-a-token-tier`.
