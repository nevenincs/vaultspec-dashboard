---
name: figma-is-the-binding-source-of-truth
---

# Figma is the binding source of truth for the design system and surfaces

## Rule

The Figma file `SlhonORmySdoSMTQgDWw3w` is the single binding source of truth for the
dashboard's design — its foundation (color, type, spacing, radius, elevation, fonts), its
component Kit, its surface frames, and its headline node-connection canvas. Code is
authored to MATCH Figma: token values mirror the binding foundation, surfaces are built to
their binding frames, and where code and Figma disagree, Figma wins and code is corrected.
This supersedes the prior code-canonical token direction. Any deliberate deviation from the
binding design (a sanctioned font substitution, a platform constraint Figma cannot express)
requires an explicit ADR recording it as an accepted divergence — it is never an ad-hoc
local choice.

## Why

The reconciliation cycle (`2026-06-16-figma-parity-reconciliation-adr`, accepted with user
sign-off) inverted the standing direction: the project had been code-canonical with Figma a
one-way mirror (the prior `themes-are-oklch-generated-from-a-token-tier` framing and
`frontend/tokens/FIGMA-SYNC.md`), but the directive is now "Figma is binding — like the
Bible." The research (`2026-06-16-figma-parity-reconciliation-research`, F0) named this as a
governance conflict that had to be settled before any downstream reconciliation was
unambiguous: two standing artifacts asserted the inverse of the directive, and until the
authority direction was pinned, every parity decision was ambiguous about which side moves.
Settling it once — Figma authors, code mirrors — is what makes parity mechanical (a token
regeneration, a frame-faithful rebuild) rather than a per-surface judgment call, and stops
the manual, ungenerated-foundation drift the research documented from recurring.

## How

- **Good:** a foundation value (a radius step, a type role, an elevation level) is read
  from the binding Figma foundation and authored into the DTCG tokens so the generated
  stylesheet matches; a surface is rebuilt to its binding frame, consuming the preserved
  stores hooks unchanged.
- **Good:** code genuinely cannot follow Figma (no bundled identity font for a web-served
  tool, a platform rendering constraint) — the deviation is recorded in an ADR as an
  accepted, named divergence, not left implicit.
- **Bad:** typing a new hex, radius, or font size into code because it "looks right," or
  treating the code value as canonical and pushing it to Figma — that re-creates the
  code-canonical direction this rule superseded and the drift F0 named.

## Status

Active. Promoted from the `figma-parity-reconciliation` ADR codification candidate at the
close of the reconciliation cycle. It flips the authority direction that
`themes-are-oklch-generated-from-a-token-tier` and `FIGMA-SYNC.md` previously asserted (both
amended to point here). Sibling of `view-rewrite-preserves-the-state-and-scene-contract`
(the boundary that makes a Figma-driven view rebuild safe) and `design-system-is-centralized`
(surfaces compose from the one centralized system — now the binding Figma one).

## Source

ADR `2026-06-16-figma-parity-reconciliation-adr` (accepted; codification candidate) and
research `2026-06-16-figma-parity-reconciliation-research` (finding F0, the governance
conflict). Sibling rules `view-rewrite-preserves-the-state-and-scene-contract`,
`themes-are-oklch-generated-from-a-token-tier`, `design-system-is-centralized`,
`figma-code-connect-via-cli`.
