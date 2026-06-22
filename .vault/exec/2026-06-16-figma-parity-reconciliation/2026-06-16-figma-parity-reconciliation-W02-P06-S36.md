---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S36'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the degradation overlays from their binding frames reading availability from the tiers block

## Scope

- `frontend/src/app/degradation/`

## Description

- Confirmed the degradation module reads availability from the per-tier tiers block through the stores layer: `deriveInputs` reads `status.tiers.semantic.available` in the stores-owned `degradationInputs` module, and the app-layer §8 matrix consumes only the derived inputs, so the surface states are never guessed from a transport error.
- Rebuilt the dev degradation debug overlay onto the semantic OKLCH token tier, replacing its prior raw rose/white Tailwind palette with the paper/ink/state and accent tokens so it reads correctly under every theme.
- Adopted the canonical Figma role/radius/elevation utilities on the overlay (text-caption/text-label, rounded-fg-md/xs, shadow-fg-overlay, spacing-vs scale) and added focus-visible rings and a hover-tinted clear/close affordance.
- Kept the dev-only gating, the condition list, the mock-degrade drive, and the override-store behaviour unchanged.

## Outcome

The degradation overlays remain a dumb projection that reads availability from the tiers block (via the stores-owned derivation) and never from a bare transport error, honoring degradation-is-read-from-tiers. The dev debug switch now draws entirely from the semantic token tier and the canonical Figma utilities, removing the last raw non-token palette in the degradation directory. The pure §8 matrix and its tiers-reading hook are unchanged; the edited overlay is eslint-clean and prettier-clean.

## Notes

The user-facing degraded-state treatments (semantic-absent stage, rag-degraded rail card, reconnecting timeline badge, search text-fallback) are painted by the consuming surfaces (Stage, the right rail, Timeline, SearchTab), which live outside this phase's scope fence; the `degradation/` directory itself owns only the §8 table, its tiers-reading hook, and the dev switch, which is what this step rebuilt. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
