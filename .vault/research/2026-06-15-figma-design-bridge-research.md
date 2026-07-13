---
tags:
  - '#research'
  - '#figma-design-bridge'
date: '2026-06-15'
modified: '2026-07-12'
related:
  - '[[2026-06-14-dashboard-design-language-adr]]'
  - '[[2026-06-14-dashboard-design-adoption-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
---

# `figma-design-bridge` research: `Figma cross-connection and design-source backport`

This research investigates how Figma cross-associates designs with local React
code, and whether — and how — we can "backport" our existing hand-rolled,
non-Figma-grounded design system so that Figma and the code are cross-connected.
The stated goal was to "drive the whole design framework from Figma." The
research finds that goal must be re-shaped: with our plan tier and the OKLCH
color model we already ship, the realistic and durable architecture is
**code-canonical with Figma as a synced mirror**, not Figma-as-master. This
document maps the mechanisms, the hard constraints (several of which invalidate
common assumptions), what our Figma **Professional** plan actually unlocks, and a
staged shape for the campaign. It grounds the existing design-language,
design-adoption, and iconography ADRs against the Figma reality.

Decisions taken with the user during research (inputs to the ADR phase): Figma
plan is **Professional, full seat**; canonical direction is **code-canonical /
Figma-mirror**; first deliverables are **both tokens and components, sequenced**
(tokens first, components second).

## Findings

### F1 — Where our design system lives today (the thing being backported)

Our design system is already a disciplined, single-source token pipeline; it is
*not* ad-hoc styling, which both helps (clean tokens to mirror) and constrains
(OKLCH cannot survive Figma) the backport.

- **Token source of truth** is one file, `frontend/src/styles.css`, structured in
  four layers: intent-free **OKLCH primitive ramps** (warm-neutral hue 75°, a
  single earthy-green accent hue ~150°, four tier hues, diff green/red) → a
  **semantic token tier** (Radix-style 12-step roles: surfaces, borders,
  accent/focus, ink) → **public chrome surfaces** emitted as `var()` chains for
  Tailwind utilities → a **scene-read surface** emitted as **literal `#rrggbb`
  hex** because the PixiJS canvas reads colors through `getComputedStyle()` and
  cannot resolve a `var()` chain or parse `oklch()`.
- **Theming** is `[data-theme]` remapping of the semantic tier — **light, dark,
  and high-contrast** are peer remaps; no component is theme-aware. A
  framework-free `themeController.ts` flips the attribute from OS preference and
  `localStorage`.
- **Tailwind v4** via the Vite plugin; tokens registered in a `@theme static`
  block in `styles.css` (no `tailwind.config.js`, no `dark:` variant). Components
  consume utilities only (`bg-paper`, `text-ink`, `border-rule`, `p-vs-2`).
- **Icons** come from Lucide (structural chrome) and Phosphor (expressive/domain),
  plus **in-family bespoke marks** authored on Phosphor's 256-unit grid
  (`scene/field/marks.ts`), with a 14px grayscale-by-shape **ink-coverage gate**
  (`markGate.ts`). Marks are dual-plane: the same SVG `d` paths render to Pixi
  textures and to React DOM components.
- **~126 React components** across `frontend/src/app/` (left rail, stage, right
  rail, timeline, islands, palette, menus), styled **100% with Tailwind utilities
  + semantic tokens** — no CSS modules, no inline color, no styled-components.
- **No component catalog exists** — no retired component gallery, Ladle, or Histoire. The only
  visual harness is the dev-only `frontend/src/prototype/` (StatusGallery), a
  narrow status-stamp matrix, not a component gallery.
- The design intent is already captured in three ADRs (design-language,
  design-adoption, iconography) and a design-adoption audit. These are the
  authored, non-Figma-grounded specs the user wants to reconcile with Figma.

Implication: the values to mirror are clean and centralized, but the canonical
color space is **OKLCH across three themes**, which is exactly what Figma cannot
hold (see F5).

### F2 — The four mechanisms Figma offers for design↔code association

There is no single "sync" feature. Figma exposes four distinct mechanisms, and
they point in different directions:

- **Dev Mode / Figma MCP server (Figma → code, read).** Runs locally against the
  Figma desktop app (`http://127.0.0.1:3845/mcp`) or as a hosted remote server.
  Read tools: `get_design_context` (the renamed `get_code`; emits React+Tailwind
  by default), `get_variable_defs` (tokens), `get_metadata` (sparse layer XML),
  `get_screenshot`, plus Code Connect lookups. This is what we have wired now —
  and every tool we have is **read-only Figma→code**.
- **Code Connect (link an existing Figma component to existing code).** Author
  `*.figma.tsx` files calling `figma.connect(Component, nodeUrl, { props, example })`,
  then `figma connect publish` uploads the **snippet + prop metadata only** (not
  source), keyed by node ID, so Dev Mode/MCP shows true-to-production code instead
  of generated markup. It **links**; it never generates Figma designs or code.
- **Variables (the token bridge).** Figma Variables (color/number/string/boolean),
  grouped in collections, themed by **modes** (light/dark/HC = one mode each),
  with primitive→semantic **aliasing** — a structure that maps cleanly onto our
  primitive/semantic tier.
- **Code → Figma import (the backport, the hard part).** Getting existing UI *into*
  Figma as design items. This has no official API path (see F4).

### F3 — What our Professional plan actually unlocks (the decisive gate)

The plan tier is the single biggest constraint, and it removes the two
mechanisms most associated with the word "cross-connect":

- **Code Connect is Organization/Enterprise-only.** It is **not available on
  Professional.** The literal goal "cross-connect React components with Figma via
  Code Connect" is therefore **off the table at our tier.** A "cross-connection"
  must be achieved another way (F7).
- **The Variables REST API (read *and* write) is Enterprise-only.** On Pro we
  **cannot** push/pull variables over REST. (Correcting two common myths: the REST
  write endpoint *does* exist, and even *reading* variables is Enterprise-gated —
  both are simply out of reach for us.)
- **What Pro *does* give us:** full Variables + modes **in the editor** and via the
  **Plugin API** (`figma.variables.*`). This is the escape hatch — it is exactly
  the channel **Tokens Studio** uses, so token sync to Figma is feasible on Pro
  without Enterprise REST.
- The local Figma MCP server (read tools) works for pulling design context and
  screenshots for **parity checking**, regardless of tier.

### F4 — The backport direction (code → Figma) is not a solved pipeline

This is the core hard truth of the campaign:

- **Figma's REST API is read-only for canvas content.** The *only* programmatic
  write path to the canvas is the **Plugin/Widget API running inside the editor**
  (plus a remote-MCP write-to-canvas beta that is Enterprise/Full-seat and
  agent-generative, not a deterministic importer). There is no server-side "POST
  my design" endpoint. Consequently **every "HTML/code → Figma" tool is a
  plugin.**
- **Honest assessment of the import options:** manual rebuild (highest fidelity,
  slowest, non-repeatable); **html.to.design** and **Codia Web2Figma** (the
  strongest dedicated importers — produce *editable* layers/auto-layout/variants
  from a live URL, but **structurally messy**: over-nested, generically named,
  detected-not-authored components); Builder.io Visual Copilot and Anima
  (primarily Figma→code, **not** useful for backport); **Figma Make** (AI
  prompt-to-*app*, generates runnable React, **not editable design nodes** — a
  common misconception, opposite of what we need).
- **What import does NOT do for us:** it does not reverse-map to our semantic
  token tier (you get raw sRGB colors, not OKLCH semantic aliases); our **PixiJS
  scene layer rasterizes** rather than vectorizing; and **re-import creates new
  frames, it does not diff/reconcile** — there is no continuous two-way code→design
  sync anywhere in the ecosystem.

Implication: seeding Figma with our UI is a **one-time, deliberate, cleanup-heavy
act**, not an automated mirror. Whatever we seed must then be *maintained* by
discipline, not by a pipeline.

### F5 — OKLCH does not round-trip through Figma (forces code-canonical)

- **Figma stores colors as RGBA floats only**, with no color-space metadata;
  document profiles are sRGB or Display P3 only. Pasting `oklch()` converts to sRGB
  hex at input (and that paste is **broken in P3 files**). Our OKLCH ramps and any
  out-of-gamut steps **cannot survive a round-trip**; the L/C/H coordinates are
  lost.
- This single fact decides the canonical direction: if Figma were the master, our
  OKLCH model — the heart of the design-language and design-adoption ADRs — would
  be flattened to sRGB. Therefore **code/Git must stay canonical for color**, and
  Figma receives a **resolved literal-hex projection per mode**. Conveniently, that
  is *exactly* the literal-hex form our scene-seam already consumes, so the lossy
  projection aligns with the existing `themes-are-oklch-generated-from-a-token-tier`
  rule rather than fighting it.
- **The lossless intermediate exists:** the **W3C DTCG** token format (stable
  2025.10) natively supports `oklch`/`oklab` with an optional hex fallback. So
  **DTCG-JSON-in-Git can be the true source**, retaining OKLCH, while emitting the
  sRGB-hex fallback that Figma needs.

### F6 — The token bridge that IS feasible on Pro

A concrete, tier-appropriate token pipeline:

- **Canonical:** DTCG `.tokens.json` in our Git repo — primitive ramps (OKLCH +
  hex fallback) and the semantic tier, with light/dark/HC expressed as the DTCG
  resolver's modes/contexts.
- **Downstream to code:** **Style Dictionary** transforms DTCG → our existing
  `:root` literal-hex + `[data-theme]` CSS (and the Tailwind `@theme` surface),
  preserving today's runtime shape. (Caveat: Style Dictionary v4 emits hex/rgb by
  default; raw `oklch()` output needs a custom transform/format, or we keep CSS as
  the hand-tuned canonical and treat DTCG as a parallel export — an ADR decision.)
- **Downstream to Figma:** **Tokens Studio** (Figma plugin) reads the same DTCG
  tokens (from Git) and writes Figma **Variables + modes** via the Plugin API — no
  Enterprise REST needed. Figma becomes a **generated, one-way color mirror.**
- **Drift control:** a CI check that fails when the Figma-export (or the Tokens
  Studio Git push) diverges from committed tokens; "single-click bidirectional
  sync" is a myth and must not be assumed.
- **Caution from the field:** do **not** store canon in any vendor's proprietary
  format. Specify (a token-SoT vendor) was sunset Nov 2025 and orphaned its format;
  keeping DTCG JSON in our own repo is the durable choice.

### F7 — "Cross-connecting components" without Code Connect (Pro reality)

Since Code Connect is Enterprise-only, cross-connection on Pro must be a
**repo-maintained mapping discipline**, supported by the read-only MCP:

- **A code↔Figma component registry in the repo:** a mapping from each React
  component to its Figma node URL/ID (and back), authored and version-controlled by
  us. This is the Pro-tier substitute for Code Connect's binding — same intent
  (name parity + a resolvable link), enforced by convention + CI rather than by
  Figma's paid feature.
- **Naming-convention contract:** Figma component/frame names mirror code component
  names 1:1, so the registry is mechanically checkable.
- **Parity verification via the local MCP:** `get_metadata` / `get_design_context`
  / `get_screenshot` let an agent pull the Figma side for a node and diff it
  against the rendered component (e.g. against a future component gallery) to catch
  drift — read-only, tier-agnostic.
- **The component gallery we lack:** because there is no retired component gallery today, building
  a **component catalog** (Ladle) is a strong prerequisite for both
  seeding Figma (a clean per-component render to import) and parity-checking it
  afterward. This is likely the first concrete build step of the component half.
- **Honest ceiling:** even with all this, Dev Mode on Pro will show **generated**
  code for a node, not our real component code (that is the Code Connect feature we
  cannot use). The "cross-connection" we can deliver on Pro is *traceable parity +
  a maintained mapping*, not Figma-native code surfacing.

### F8 — Recommended architecture (code-canonical, Figma-mirror)

Synthesizing F1–F7 with the user's chosen direction:

- **One source of truth: the repo.** Tokens live as DTCG-JSON-in-Git (retaining
  OKLCH); components live as React + Tailwind as today. Figma is a **downstream,
  human-facing mirror**, kept in sync but never the master.
- **Tokens:** DTCG → Style Dictionary → CSS (code) and DTCG → Tokens Studio →
  Figma Variables/modes (Figma). Color flows **one way, code → Figma.**
- **Components:** seed Figma once (manual rebuild for the design-system primitives;
  importer for complex composite screens, with budgeted cleanup), then maintain a
  **repo-side code↔Figma mapping registry** with naming parity and MCP-based parity
  checks. Designers work in a Figma that reflects the real system; engineers keep
  code canonical.
- **"Figma-driven" reinterpreted:** designers *design in Figma against a synced
  mirror*, and the MCP lets agents pull that design context to drive
  implementation of *new* surfaces — Figma drives *new design exploration and
  net-new build*, while the *existing* system stays code-canonical. This is the
  achievable form of the user's goal.

### F9 — Myths corrected during this research (avoid building on them)

- "The Figma MCP can write to Figma" — **false for the local server** we have
  (read-only); only the remote, Enterprise/Full-seat, beta server writes.
- "Code Connect (or Figma Make) generates Figma components from code" — **false.**
  Code Connect links existing→existing; Figma Make generates a runnable app, not
  design nodes.
- "Figma supports OKLCH" — **false.** RGBA only.
- "The Variables REST API can/can't sync tokens" — it **can** write, but is
  **Enterprise-only**; irrelevant to us on Pro (use the Plugin API via Tokens
  Studio).
- "One-click / real-time bidirectional design↔code sync exists" — **false.** Every
  working setup picks one canonical side + a generated mirror + an explicit
  conflict rule.

### F10 — Open questions for the ADR

- **Tokens dual-source risk:** is `styles.css` still hand-authored canonical with
  DTCG as an *export*, or does DTCG become canonical and `styles.css` *generated*?
  The latter is cleaner long-term but is a real migration of the design-adoption
  work; this is the central ADR decision.
- **Seeding strategy per layer:** which surfaces are manually rebuilt in Figma
  (token styles, primitives, icon set) vs importer-seeded (composite screens), and
  who owns the cleanup budget.
- **Component gallery:** adopt Ladle now as the seeding + parity
  substrate? (Strongly implied prerequisite.)
- **Mapping registry format & CI:** where the code↔Figma registry lives, its
  schema, and what the drift-detecting CI check asserts.
- **Scene layer:** the PixiJS field has no Figma representation (it rasterizes).
  Decide whether the scene is explicitly out of scope for Figma mirroring (likely
  yes) and documented as such.
- **Tooling spend:** Tokens Studio paid tier (Git sync) and any importer Pro tier —
  small but real recurring costs to confirm.

### F11 — Risks

- **Drift is the default.** Without a CI parity gate, the Figma mirror silently
  diverges and becomes misleading — worse than no mirror.
- **Backport cleanup cost is easy to underestimate.** Importer output is
  editable-but-messy; budgeting "faster than scratch, slower than hoped" is the
  honest expectation.
- **Scope creep into Figma-as-master.** The OKLCH constraint makes that path
  actively harmful; the ADR must fence it.
- **Tier ceiling.** If true Code Connect / REST automation is later wanted, it
  requires an Org/Enterprise upgrade — a budget decision to flag now, not discover
  later.

## Recommended next step

Proceed to an **ADR** (`vaultspec-adr`) that fixes: (1) the canonical direction
(code-canonical / Figma-mirror, already chosen); (2) the tokens decision in F10
(DTCG canonical vs export); (3) the Pro-tier component cross-connection approach
(mapping registry + naming parity + gallery); (4) explicit non-goals (Figma as
master, OKLCH in Figma, scene-layer mirroring, Code Connect at current tier).
Then an L3/L4 plan sequencing **tokens-first, components-second**, per the user's
choice.
