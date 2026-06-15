---
tags:
  - '#adr'
  - '#figma-design-bridge'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-15-figma-design-bridge-research]]"
---



# `figma-design-bridge` adr: `Code-canonical Figma mirror with a Pro-tier cross-connection registry` | (**status:** `accepted`)

## Problem Statement

The dashboard's design system is hand-rolled and not grounded in Figma: an OKLCH
token tier in `frontend/src/styles.css`, ~126 React components styled with
Tailwind utilities, and Lucide/Phosphor iconography — all authored directly in
code with no Figma representation. The goal is to "backport" this system into
Figma and cross-connect every front-end design implementation with Figma designs,
so the design framework is Figma-grounded going forward.

Research (`2026-06-15-figma-design-bridge-research`) established that the naive
form of this goal — Figma as the master that drives code — is not achievable at
our plan tier and is actively harmful given our color model. This ADR fixes the
architecture that *is* achievable and durable: code-canonical with Figma as a
synced mirror, plus a Pro-tier substitute for the Code Connect feature we cannot
use. It re-grounds the existing design-language, design-adoption, and iconography
ADRs against Figma without surrendering them to it.

## Considerations

- **Plan tier is Professional (full seat).** This removes the two mechanisms most
  associated with "cross-connect": **Code Connect is Org/Enterprise-only**, and
  the **Variables REST API (read and write) is Enterprise-only**. What Pro retains
  is full Variables + modes in-editor and via the **Plugin API** — the channel
  Tokens Studio uses.
- **Direction of association.** Figma → code is mature (Dev Mode / Figma MCP read
  tools, already wired). Code → Figma has **no faithful, repeatable pipeline**: the
  only canvas write path is plugins, output is editable-but-messy, and re-import
  creates new frames rather than reconciling.
- **Color model.** Figma stores RGBA only; our OKLCH ramps cannot round-trip.
  **DTCG** (W3C, stable 2025.10) natively holds `oklch` with a hex fallback, so a
  lossless intermediate exists in code, and Figma takes the resolved hex per mode —
  which matches the literal-hex scene seam we already emit.
- **No component catalog exists.** There is no Storybook/Ladle/Histoire; only a
  narrow dev prototype. Seeding Figma and verifying parity both need a clean
  per-component render surface.
- **Tooling weighed:** Style Dictionary (code-side transform), Tokens Studio
  (Figma-side Plugin-API token sync + Git bridge), html.to.design / Codia
  (importer seeding), the local Figma MCP read tools (parity checks). Rejected as
  master/source: Figma Variables (lossy for OKLCH), any vendor proprietary token
  format (Specify's 2025 sunset is the cautionary tale).

## Constraints

- **Hard tier ceiling:** Code Connect and Variables REST are unavailable on Pro and
  cannot be worked around at this tier; true Figma-native code surfacing and REST
  token sync would require an Org/Enterprise upgrade (a budget decision, not an
  engineering one). The cross-connection delivered here is *traceable parity + a
  maintained mapping*, not Figma-native Code Connect.
- **No two-way sync exists** anywhere in the ecosystem; "one-click bidirectional"
  is a myth. Every seam is one-way with an explicit conflict rule.
- **Frontier/tooling churn:** DTCG is a Community Group Report (not a W3C
  Standard); Style Dictionary v4 emits hex/rgb by default and full DTCG-2025.10
  OKLCH support lands in v5 — so `oklch()` emission needs a custom transform or a
  deliberate hex-only projection. Tokens Studio DTCG support is opt-in. These are
  young surfaces requiring version pinning and verification, not assumption.
- **Dependency on the existing token tier:** this work builds directly on the
  design-language/design-adoption token architecture; that surface is stable
  (shipped and audited), which makes it a safe parent to derive DTCG from.
- **Scene layer is out of reach:** the PixiJS field rasterizes under any importer
  and has no faithful Figma representation; it is excluded by constraint, not
  oversight.

## Implementation

A repo-canonical design system with Figma as a generated, human-facing mirror,
delivered in two sequenced halves.

**Decision 1 — Tokens: DTCG-JSON-in-Git becomes canonical; `styles.css` color is
generated downstream.** A new DTCG token source (primitive OKLCH ramps with hex
fallback, the semantic tier, light/dark/HC as resolver modes) becomes the single
source of truth for design values. **Style Dictionary** transforms it into the
existing `:root` literal-hex + `[data-theme]` CSS surface and the Tailwind
`@theme` registration, preserving today's runtime shape exactly. The migration is
staged to avoid a flag-day: DTCG is first introduced as a *verified export* of the
current hand-authored `styles.css` (a generated artifact is diffed against the
committed CSS until byte-equivalent), and only once parity is proven does
generation become canonical and the hand-authored color blocks are retired. This
de-risks the central change while reaching the cleaner end state.

**Decision 2 — Token push to Figma via Tokens Studio (Plugin API), one way.** The
same DTCG tokens feed Tokens Studio, which writes a Figma **Primitives** collection
(one mode) and a **Semantic** collection (light/dark/HC modes, aliasing
primitives) through the Plugin API — no Enterprise REST. Figma is a one-way color
mirror; the resolved hex-per-mode is accepted as a deliberate lossy projection
(OKLCH stays lossless in DTCG).

**Decision 3 — Component cross-connection without Code Connect.** Three parts: (a)
adopt **Storybook** as the component gallery and seeding + parity substrate
(Vite builder, matching our stack) — it also retires a real gap (no catalog
today); (b) a
repo-maintained **code↔Figma mapping registry** — a version-controlled mapping of
each React component to its Figma node URL/ID with **1:1 naming parity** — as the
Pro-tier stand-in for Code Connect's binding; (c) **read-only MCP parity checks**
using `get_metadata` / `get_design_context` / `get_screenshot` to diff the Figma
node against the gallery render and flag drift. Figma is **seeded** once — design
primitives, the icon set, and token styles rebuilt manually for fidelity; complex
composite screens importer-seeded (html.to.design / Codia) with a budgeted cleanup
pass.

**Decision 4 — CI drift gate.** A check fails the build when the DTCG-derived CSS
diverges from committed output, and (component side) when a registry entry's
naming parity or node reference is broken. Drift is the default failure mode; the
gate is what keeps the mirror honest.

**Decision 5 — Explicit non-goals (fenced):** Figma as the master/source of
truth; OKLCH stored in Figma; mirroring the PixiJS scene layer into Figma; Code
Connect or Variables REST at the current tier. "Figma-driven" is reinterpreted as:
designers work in a synced Figma mirror, and the MCP lets agents pull Figma design
context to drive *net-new* surface implementation — the existing system stays
code-canonical.

## Rationale

The research is decisive on three points that jointly force this architecture.
First, **OKLCH cannot round-trip through Figma** (RGBA-only), so making Figma the
master would flatten the very color model the design-language ADR is built on —
code must stay canonical for color (research F5). Second, our **Professional tier
removes Code Connect and Variables REST** (F3), so the literal "cross-connect via
Code Connect" goal is unreachable and must be substituted by a repo-maintained
registry (F7). Third, **code → Figma is not a solved pipeline** (F4) — seeding is a
one-time, cleanup-heavy act, not an automated mirror, so the durable seam is
one-way code → Figma with a CI drift gate (F6, F8). Choosing DTCG-in-Git as canon
(F5) keeps OKLCH lossless while still feeding both code and Figma, and aligns with
the existing `themes-are-oklch-generated-from-a-token-tier` discipline. The
component-gallery prerequisite is surfaced directly by the absence of any catalog
today (F1).

## Consequences

- **Gains:** OKLCH and the three-theme model are preserved intact; designers get a
  Figma that reflects the real system; tokens flow from one canon to both code and
  Figma; net-new surfaces can be Figma-driven through the MCP; a long-missing
  component gallery is established as a side benefit.
- **Honest difficulties:** the canonical-tokens migration touches the shipped
  design-adoption surface and must be parity-gated to avoid regressions; importer
  seeding is editable-but-messy and the cleanup budget is real; the mapping
  registry and parity checks are ongoing discipline, not one-time setup; Tokens
  Studio Git sync and importer Pro tiers carry small recurring cost.
- **Pathways opened:** a clean upgrade path — if the org later moves to
  Enterprise, the registry can be promoted to real Code Connect and the Plugin-API
  push to Variables REST, without rearchitecting the canon.
- **Pitfalls fenced:** scope creep toward Figma-as-master (actively harmful here);
  silent mirror drift (the CI gate exists to prevent it); storing canon in a
  vendor format (rejected in favor of DTCG-in-our-repo).

## Codification candidates

- **Rule slug:** `design-tokens-are-code-canonical-figma-is-a-mirror`.
  **Rule:** Design tokens are authored as DTCG-JSON in the repo and flow one way to
  both the CSS token tier and Figma Variables; Figma is never the source of truth
  for tokens, and OKLCH is never stored in Figma (it ships the resolved hex
  projection per mode).
- **Rule slug:** `figma-code-association-goes-through-the-mapping-registry`.
  **Rule:** At the current Figma tier, a React component is cross-connected to its
  Figma node only through the repo-maintained code↔Figma mapping registry with 1:1
  naming parity, never assumed via Code Connect; the CI drift gate must pass before
  the mirror is declared in sync.
