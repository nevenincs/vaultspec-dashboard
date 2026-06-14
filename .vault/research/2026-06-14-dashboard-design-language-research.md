---
tags:
  - '#research'
  - '#dashboard-design-language'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-12-dashboard-gui-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-design-language` research: `design language and UI/UX foundation`

This research opens a design-driven redefinition of the vaultspec dashboard frontend.
The product owner's brief (corrected mid-research): the UI is a deliberate
**trend-follower**, not a distinctive brand skin. The target audience is **programmers
and developers** who already live in IDEs and agentic-coding desktop apps, and the design
must converge on the language those tools are settling into — **clean, modern, reactive,
with dark and light as equal peers**. The named reference set to follow is **Google
Antigravity** (the strong recent agentic-IDE reference UI), **OpenAI Codex Desktop**, and
**Claude Desktop** — the last praised specifically for folding *human / tactile* warmth
into an otherwise professional UX. The earlier "paper-warm distinctive brand" framing is
explicitly rejected as branding; any warmth must be the restrained, token-level Claude
lineage, never decorative identity. Scope is **spec work**: this artifact and the ADR
that follows pin the design-language and UX foundations only. Architecture and
implementation (which of the four layers change, and how) is deferred to a later cycle;
nothing here commits code.

The existing in-repo design DNA (paper-warm tokens, the hand-drawn glyph family, the
visual charter) is recorded below as *one honest input* — useful for what it got right
about constraints (grayscale-safe tiers, bounded graph, truthfulness) — but it is not the
target identity. The target is the convergent agentic-desktop language of §C′.

The findings gather four threads: (1) an honest inventory of the design DNA already in
the repo and the conceptual model any language here must represent; (2) a curated
external reference set of calm, dense, instrument-grade UIs; (3) surface-specific UX
patterns for the three signature surfaces (graph, timeline, inspector) plus
accessibility; and (4) the foundational token/theming/color/type mechanics for the
confirmed stack. The artifact closes with the decision menu the ADR must resolve.

## Findings

### A. The existing design DNA (the starting input, not the constraint)

The dashboard is **not greenfield**. A deep, internally-consistent visual language
already ships, authored across the `2026-06-12-dashboard-gui` cycle. The fresh
exploration is free to keep, refine, or discard any of it — but it must do so
deliberately, because the existing DNA is unusually principled.

**Three governing stances** (`2026-06-12-dashboard-gui-adr` §1): *the graph is the
product*; *truthfulness over polish* (degradation is rendered as legible designed
states, never as errors or silent absence); *conventional skeleton, distinctive skin*.
The named anti-goal is "the hairball."

**The charter split** (§7.1): everything *structural* (layout, shortcuts, scroll/zoom
physics, focus order) follows converged agentic-desktop convention; everything
*expressive* (iconography, illustration, line quality, texture, empty states, motion) is
bespoke and hand-drawn. Tie-breaker: when ambiguous, treat it as structural.

**Palette philosophy** — "calm, paper-warm neutral ground; ink for structure" with the
load-bearing rule **"color is *spent* on tier identity, state, and liveness"** ("if
everything is colorful, confidence tiers can't speak"). Concrete current tokens
(`frontend/src/styles.css`, light theme): ground `--color-paper #faf9f7` /
`--color-paper-raised #ffffff` / `--color-paper-sunken #f2ede6` / `--color-paper-aged
#f5efe2` (the time-travel "paper ages" tint); ink `--color-ink #2b2620` /
`--color-ink-muted #6a6258` / `--color-ink-faint #a39b8f`; four tier hues (declared
`#3a342c`, structural `#2f7d4f`, temporal `#4a4137`, semantic `#7d6f9e`) with hue
*secondary* to line treatment; state colors (active, complete, archived, stale
`#a07520` darkened to clear the 3:1 floor per audit finding 038, broken `#b3502d`, live
`#1f8a5d`); accent forest-green `#2f7d4f`.

**Dark theme is a variable remap only** under `[data-theme="dark"]` — no component knows
its theme. The Pixi/sigma scene reads the same CSS variables via `getComputedStyle` +
`MutationObserver` so the GPU field re-tints live.

**Type, space, motion**: a compact instrument scale (10 / 11 / 13 / 13+medium / 15 px);
a 4 px spacing grid; three ink-tinted elevation shadows; three radii (4 / 6 / 10 px);
"organic settle" motion — `cubic-bezier(0.22, 1, 0.36, 1)` in a 150–250 ms band, with
`prefers-reduced-motion` honored.

**The glyph family**: a commissioned **26-glyph hand-drawn family** (`doc-`,
`node-feature`, `event-`, `tier-`, `state-`, `ring-` categories) with a strict
construction discipline — exact anchor geometry ("a wobbly line may be the aesthetic; a
wobbly value is a lie"), one line family in three weights, round caps/joins, single
`currentColor` ink. It is **design-source-only and not yet wired** into the running
field (which still uses programmatic placeholders behind the `GlyphTextureProvider`
seam). This is the single largest open expressive-layer gap and a natural anchor for the
exploration.

**Hard accessibility gates already met**: the four tier marks distinguish in **pure
grayscale at 14 px by shape + treatment alone** (declared = filled diamond, structural =
open square + accent notch, temporal = dashed ring + dot, semantic = three stacked
tildes); hue is never load-bearing; WCAG AA on both themes; keyboard floor (arrow-walk
the graph, bracket-step the playhead).

### B. The conceptual model the language must represent

Every view is a projection over a single model — the engine's `LinkageGraph`, mirrored
client-side by `frontend/src/stores/` (the `views-are-projections-of-one-model` and
`dashboard-layer-ownership` rules). The design language must give legible form to these
entities (`2026-06-12-dashboard-foundation-reference`):

- **Two node species.** *Feature nodes* — synthesized convergence points (a feature is
  the cluster of its research/adr/plan/exec/audit/reference docs), the default
  constellation population, sized by member count. *Document nodes* — typed by directory,
  revealed on descent. Node anatomy carries silhouette (type), a progress ring (e.g.
  plan 7/12), lifecycle fill (active inked / complete settled / archived faded), a
  freshness halo (recency as saturation decay — the network visibly "cools"), and
  per-tier degree badges.
- **Four provenance tiers = four fixed line treatments** (the spine of the language):
  declared (solid, authoritative), structural (drawn, status-colored resolved/stale/
  broken), temporal (dotted, flow), semantic (translucent "haze", associative).
  Confidence is encoded as lightness/grain, not transparency alone.
- **The tiers degradation block**: every wire response (success and error) carries a
  per-tier availability block; absent tiers render as *designed degraded states*. This
  is the product's truthfulness mechanism and a first-class design surface.
- **Two LOD granularities**: constellation (feature) is the unbounded-safe default, with
  inter-feature edges as aggregated meta-edges (ribbons, thickness = count); document
  granularity arrives on descent, hard-capped (`MAX_GRAPH_NODES`) with an honest
  `truncated` block. All graph reads are bounded (`graph-queries-are-bounded-by-default`).
- **Timeline / time-travel**: ≤4 fixed lanes (commits · doc events · lifecycle), a
  LIVE-by-default right-docked playhead; scrubbing off LIVE enters time-travel mode (the
  stage tints to `paper-aged`, ops disable, a return-to-live chip docks). Mechanics are
  keyframe + diff replayed on one monotonic delta clock. **Semantic is present-only by
  design** — history renders it "inapplicable," not "absent."
- **Events, worktrees, ops, search**: events carry `node_ids` (timeline click → stage
  pulse); worktree switching swaps stage scope wholesale and statelessly; ops are a
  transparent whitelisted proxy (the engine is read-and-infer); search is a rag
  pass-through that degrades to text-match with an explicit "semantic offline" state.

### C′. The convergent agentic-desktop language (PRIMARY anchor)

This is the target register. A focused pass on the named references and their cohort
(Cursor, Windsurf, Zed, VS Code, Linear) found a strong, current convergence (sources
Nov 2025 – Mar 2026).

**Per-app profiles:**
- **Google Antigravity** (Google, Nov 2025; a VS Code fork, agent-first). Two co-equal
  surfaces: an Editor view and a "Manager" mission-control console orchestrating parallel
  agents across editor/terminal/browser. Its strongest UI idea: **agent plans rendered as
  reviewable documents** with Google-Docs-style inline commenting and checklists, and
  task completion as a **"visual receipt"** (task list + annotated diffs + screenshots).
  Dark/light at setup, follow-system auto-switch. Polish over placeholder states.
- **OpenAI Codex Desktop** (macOS 2025, Windows Mar 2026; Electron). Organizes around
  **projects → threads → parallel agents**, not a file tree. Ships a token theme system
  (`codex-theme-v1`) whose core tokens are exactly **`surface` / `ink` / `accent` /
  `contrast` / `variant: dark|light`**, with `fonts.ui` and `fonts.code` defaulting to
  **`null` = system font**, and semantic `diffAdded`/`diffRemoved`. It ships **Linear and
  Notion as first-class partner themes** — direct evidence of convergence. Signature
  micro-interaction: a **thinking-state cursor that wiggles, takes playful paths, and
  derives its hue from the system wallpaper** — liveness, not flourish.
- **Claude Desktop** (Anthropic) — the warmth reference. Its tactile quality is
  concrete and entirely token-level: **warm low-chroma neutrals** (cream surfaces
  ≈ `oklch(0.97 0.02 70)`, not pure white, not blue-gray), **one muted earthy accent**
  (terracotta ≈ `oklch(0.70 0.14 45)`, not neon), **dark mode that keeps the warmth**
  ("evening conversation, not a cold terminal"), **rounded geometry**, and an approachable
  **copy tone**. The human element is hue-on-neutrals + one accent + radius + voice —
  never texture or decoration.

**The distilled convergent language (the target):**
- **Dark-first with light as a true peer**, system auto-switch; identity must survive
  both themes.
- **A tiny generative theme core — `surface` + `accent` + `contrast`** — themes generated
  in a perceptual color space (OKLCH/LCH), not hand-listed. (Linear collapsed ~98
  per-theme vars to these 3; Codex mirrors them.) This *is* the OKLCH + token-tier
  direction from §E, validated by the cohort.
- **Restraint as the aesthetic:** one muted accent, gradient-free, dim chrome so content
  leads ("don't compete for attention you haven't earned").
- **"Structure felt, not seen":** depth via subtle multi-level elevation + soft, rounded,
  low-contrast 1px borders; prune borders without a reason.
- **Keyboard-first:** `Cmd/Ctrl+K` palette (a lifted surface), `Cmd/Ctrl+,` settings.
- **Compact-but-breathing density**, alignment-obsessed; **separate UI vs code type
  scales**; **system/variable UI sans + a dedicated mono**.
- **Fast, subtle, reactive motion** that communicates state/liveness (the Codex
  thinking-cursor lesson), never ambient decoration.
- **Agent-surface grammar:** plans as reviewable checklist documents (steerable before
  execution), streaming output as subtle liveness, **granular per-diff accept/reject**,
  **diff legibility treated as sacred** (green/red near-hardcoded), completion as a
  scannable "visual receipt", and first-class low-friction approval/permission flows.

**Warmth without breaking the clean/modern/reactive register** (reconciles the brief):
warmth lives only in (1) **warm-hued very-low-chroma neutrals** (carried into dark too),
(2) **one muted earthy accent**, (3) **soft depth + consistent radius**, (4) **alive,
purposeful micro-interactions**, and (5) **human copy tone**. Guardrail: it must never
become textures, skeuomorphism, gradients, multiple accents, or reduced contrast —
**contrast, diff legibility, density, and reactivity override warmth** on conflict. This
is how the dashboard keeps a subtle human signature (the value the rejected paper-warm
brand was reaching for) while reading as a native member of the agentic-desktop cohort.

**Note for the ADR:** these references are *consumer/IDE* tools; this product is a
knowledge-graph **instrument** over a vault. The convergent language is the base UI
register; the product-specific layers (tier-as-treatment, grayscale-safe identity,
bounded graph, the tiers truthfulness mechanism, time-travel mode honesty) ride on top of
it and are unchanged by the pivot.

### C. The supporting reference set (calm / instrument anchors)

The research-proposed shortlist, ranked by relevance to a calm, dense, knowledge-graph
instrument. Each is a source of *transferable principles*, not visual copy.

**Primary anchors (calm + dense register):**
- **Linear** — the single closest reference. Rationed accent (color spent on one primary
  action per view); a narrow ~4-step elevation stack (cards earn presence via 1px inset
  borders + soft shadows, not fills); deliberately *receding* chrome (nav dimmed so the
  work surface dominates); structure felt, not seen (fewer separators, restraint over
  ornament); typography as density. Linear also moved its theme engine to LCH and
  collapsed ~98 per-theme variables to three inputs (base / accent / contrast) generating
  even a high-contrast theme — directly relevant to the token architecture below.
- **Bloomberg Terminal** — the density ceiling. Density = value ÷ (time × space); a
  command language over menus; "conceal complexity, don't remove it" via ruthless layout
  consistency. Borrow the philosophy (command-driven, instant, consistent), not the
  chrome.
- **Raycast / Superhuman** — the keyboard-first interaction model. Search-as-doing
  (find an object, then act on it — maps onto node → inspect/expand/pin); the command
  palette as the spine; **palette shows the shortcut next to each command** (passive
  muscle-memory training); speed as a feature (50 ms budgets).

**Systematic density references (token/grid blueprints):**
- **IBM Carbon** — the 2x + condensed grid for dashboards; gutter borders 1px darker
  than background (Linear's technique, formalized as tokens); dark mode as a token-set
  swap, not per-component repaint.
- **GitHub Primer** — functional/semantic color tokens and a unified spacing scale; a
  working example of a genuinely dense product on a calm token system.
- **Radix Colors** — the 12-step perceptual scale with fixed semantic steps (see §E).

**Knowledge-graph-specific:**
- **Obsidian / Anytype / Tana** — the only references that solve graph-of-documents
  directly. Hairball management via depth/query subsetting; encode meaning in appearance
  (size, link thickness, type color); Shneiderman's "overview first, zoom and filter,
  details-on-demand"; hover highlights node + connections, click opens the document.

**Calm-via-speed and the airy counterweight:**
- **Zed** — for an engineering audience, "calm" is largely *latency*: GPU-rendered
  speed, immediate keystroke response. Validates that the live graph + instant query
  response are part of the design language, not just engineering.
- **Things 3** — the airy pole of calm: whitespace as structure. The dashboard sits
  between Bloomberg density and Things breathing room; Things sets the upper bound on
  local breathing room that dense panels can borrow.

**Surface-specific references** (consulted in §F): Gephi / Cytoscape / Neo4j Bloom /
yWorks / node editors (graph); Figma version history, Datadog live/fixed time modes,
Grafana state-timeline, video-editor transports, and Heer & Robertson's *Animated
Transitions* (timeline); VS Code outline, Figma right panel, Bloom inspector
(inspector); WCAG SC 1.4.1, Carbon and TPGi data-viz a11y guidance (accessibility).

### D. Cross-cutting design principles (the distilled spine)

These are the load-bearing decisions the ADR should adopt or consciously reject.

- **Ration the accent.** The interface is monochrome by default; hue is *spent*, not
  sprinkled — reserved for the single primary action, the per-tier/state semantics, and
  graph node/edge type. (Linear; converges with the existing "color is spent" rule.)
- **Structure by restraint, not chrome.** Separators are 1px borders slightly darker
  than the ground (both themes), not fills; hierarchy is figure-ground attenuation
  (supporting chrome dimmed, active surface brightest), not borders-everywhere. (Linear,
  Carbon.)
- **Shape/treatment first, hue redundant.** Categorical identity (the four tiers, node
  types) is carried by shape and line treatment; hue is reinforcement that may be
  stripped without collapse. This satisfies WCAG SC 1.4.1 as a *baseline requirement*,
  caps cognitive load (≤3 shapes per the graph-viz literature), and survives grayscale.
- **Density comes from organization, not shrinking.** Compact type scale, tabular
  numerals, whitespace and proximity carrying meaning (Tufte data-ink; Gestalt).
- **Calm = minimal + fast + purposeful motion.** UI animation < 300 ms; high-frequency
  and **keyboard-initiated actions never animate** (they must feel instant); motion only
  to show the next step, signal a change, or confirm completion. Latency budget is part
  of the design: <100 ms feels simultaneous (no animation), 100 ms–1 s bridge with a
  transition.
- **Command palette is the spine.** Object-then-action flow; minimal chrome; shortcuts
  shown inline to train muscle memory. (Raycast / Superhuman.)
- **Progressive disclosure everywhere.** Overview (bounded LOD) → zoom & filter →
  details-on-demand. Default to a local/filtered view; never render the hairball.
- **Consistency is the calming agent.** Same header layout, action placement, and
  command vocabulary everywhere — consistency is what lets density stay legible.
- **Mode honesty.** Time-travel must be an enforced, unmistakable mode (the analog of
  the tiers truthfulness mechanism); the UI must never let the user mistake the past for
  now, nor a degraded tier for an error.

### E. Foundational mechanics (tokens · theming · color · type · Tailwind v4)

Stack confirmed (`frontend/package.json`): React 19.2, Tailwind CSS v4.3 (CSS-first
`@theme`), TypeScript 6, Vite 8; render via PixiJS 8 / `@pixi/react` 8 / sigma 3; state
via zustand 5 + TanStack Query 5. No component library — bespoke chrome. A hard
constraint: **tokens must be readable from JS via `getComputedStyle`** because the canvas
scene consumes them, so they cannot be class-only.

- **Adopt an explicit token-tier split now.** The current file collapses primitive and
  semantic into one tier (raw hex sits directly on semantic names like
  `--color-tier-declared`), which forces every theme to re-declare every value. Move to
  the consensus model: **Tier 1 primitive ramps** (`--color-ink-1…12`, accent ramp,
  intent-free) → **Tier 2 semantic aliases** (`--color-paper`, `--color-state-active`,
  named for *why* not *what*; this is the tier themes remap). Defer **Tier 3 component
  tokens** until a component demonstrably needs to override a semantic default
  (consistent with not introducing abstraction speculatively).
- **Build ramps in OKLCH.** Perceptual uniformity is the technical mechanism behind
  "treatment-first, hue-secondary": fixing L and C and varying only H yields four tier
  hues of equal apparent weight whose *lightness-only (grayscale) projection stays
  distinguishable* — identity that survives grayscale by construction. OKLCH ramps also
  give monotonic accessible contrast steps, retiring the manual darkening hacks (the
  `038` stale fix). Linear validated the LCH approach; OKLCH is the better modern choice
  and is a native CSS function (no build step).
- **Model the semantic tier on Radix's 12 steps.** This fills the current gaps: discrete
  component-bg hover/pressed states (steps 3–5, currently absent) and a dedicated
  focus-ring border (step 8). Use **alpha colors** for the semantic "haze" and overlays
  so they composite correctly over the aging-paper tint. Saturate the neutral ramp with
  a trace of the accent hue ("natural gray") so the accent never looks dirty against the
  warm ground — the dark `--color-paper #211e1a` already does this informally.
- **Keep the variable-remap theming; do not adopt the `dark:` variant.** `@theme`
  declares the variables + defaults; per-theme remaps live under `[data-theme="…"]`
  (move them from `@layer base` to a dedicated `@layer theme`). Treat high-contrast as
  just another `[data-theme="hc"]` remap — cheap once the semantic tier exists.
  **Re-prove contrast (APCA/WCAG) per theme** for every text/border token; the warm
  ground shifts effective contrast versus pure white/black.
- **Typography: keep the compact scale and the system font stack.** No bundled fonts for
  a web-served dev tool (zero network cost, native feel). Mandate
  `font-variant-numeric: tabular-nums` on all data-bearing contexts (timestamps, counts,
  ahead/behind, the tiers block). Add a `--font-mono` (system mono) token for true
  identity/code only — blob hashes, byte spans, provenance stable keys, paths. Avoid
  fluid `clamp()` type: a fixed-density instrument wants stable sizes.
- **Tailwind v4 specifics.** `@theme` stays top-level. Use `@theme inline` for any
  aliasing token (a Tier-2 token whose value is `var(--primitive)`), else the generated
  utility carries an unresolved `var()`. Use `@theme static` (at least for the color
  namespace) so canvas-only tokens — used by `getComputedStyle`, never as a class — are
  never tree-shaken out. Document the shared `:root` token layer as the **one sanctioned
  cross-layer read**: the same token feeds chrome utilities, bespoke component `var()`,
  and the Pixi/sigma scene.

### F. Surface-specific UX patterns

**Graph / network view.** Cap entity shapes at ≤3; color nodes by type, edges by
relation family, but treat color as secondary to line treatment + thickness (strength) —
the graph should "look good in greyscale." Use **semantic zoom, not geometric** — a
constellation feature node remains a stable landmark as documents resolve under it
(reinforcing stable-key identity). Start focused (the literature independently arrives at
20–50 nodes / a bounded default, matching `MAX_GRAPH_NODES`); declutter by
**filter/expand-on-demand and node grouping/combos**, not by juggling N hues. Selection
is **highlight-neighbors + dim-the-rest (focus+context)** — filtered elements greyed and
non-interactive, not removed. Defer labels by LOD tier; truncate + tooltip at document
granularity.

**Timeline / time-travel.** Make it a **first-class enforced mode** (Figma version
history: historical = explicitly read-only; Datadog: explicit live vs fixed). Name the
modes — sliding (live SSE), growing, fixed (as-of). Provide a scrubbable playhead +
transport, marquee range selection, event marks at change points, and keyboard stepping
by unit. The **diff/replay animation** must obey Heer & Robertson's *Animated
Transitions*: add = fade-in, remove = fade-out, retier/relink = a *distinct* staged
transition; same semantic operation always looks the same; never reuse a mark for a
different data point (object constancy — this is exactly where the
`provenance-stable-keys-are-identity-bearing` rule becomes user-visible, since re-keying
would produce phantom remove/add pairs). ~1 s eased transitions; **when two states share
no structure, do not animate** (static cut) — which is also the reduced-motion behavior.

**Inspector / detail panel.** Structure: header (identity + tier badge by shape) →
always-visible primary metadata → collapsible grouped sections (provenance, evidence,
timestamps) → related-items list grouped by edge tier/relation, top-N + "show all"
(Netflix metadata pattern; Bloom inspector). Add an in-panel filter box for long
lists (VS Code outline). **No hover-only information** (a11y). The inspector stays a dumb
view: it subscribes to a stores selector and emits select/expand/hover intent; it never
fetches and never reads raw `tiers`.

**Accessibility (baseline, not polish).** Color-independent encoding by shape / texture
/ position / direct labels satisfies WCAG SC 1.4.1 (Level A) — document the tier-shape
mandate as *conformance*, not style. Target 3:1 on outlines / focus rings / borders;
reserve saturated fills for alert/degraded states. Full keyboard model (tab into graph,
arrow-key between nodes/neighbors, keyboard expand/collapse, playhead stepping) with
visible high-contrast focus. `prefers-reduced-motion` swaps diff/replay animation for
instant transitions and gates all transport autoplay.

### G. Known pain / constraints the new language must carry

These come from the GUI and optimization audits (`2026-06-13-dashboard-gui-audit`,
`2026-06-13-dashboard-optimization-audit`) and remain true regardless of the visual
direction chosen:

- **State-isolation invariants** (HIGH findings 022 / 023 / 018, all in the stores
  layer): scope swap is a *wholesale* swap; pins/lenses are keyed by workspace+scope, not
  globally; nothing bleeds across scopes. A redesign must not re-scatter wire/state
  access into views.
- **Truthfulness must reach served data, not just chrome** (finding 035): a degraded
  state must degrade the *data*, not paint a UI overlay over an un-degraded corpus —
  "a truthfulness gap inside the truthfulness feature." Tier *content* must be gated on
  the tier *degradation state* (011); correlated commits must keep their attribution
  rule (028).
- **A11y floor needs re-proving on a new palette** (038): the `stale` hue was darkened
  specifically to clear 3:1; any new palette must re-prove AA rather than assume it. The
  command palette needs a real focus trap + focus restore and a live-region for
  arrow-walk selection announcements.
- **Contract-deferred constraints** (not bugs): no `excerpt` wire field yet (inspector
  content preview is a deviation); semantic tier is present-only in history by design;
  the bundle carries a Pixi + TanStack chunk-size advisory.

### H. Decisions taken (to be formalized in the ADR)

The product owner has steered these; the ADR formalizes them with rationale and
consequences.

1. **Identity = trend-follower convergence, not a brand skin.** Adopt the convergent
   agentic-desktop language of §C′ (Antigravity / Codex Desktop / Claude Desktop cohort):
   clean, modern, reactive. The paper-warm *brand* framing is rejected.
2. **Dark and light are equal peers**, system auto-switch; identity survives both.
3. **Color architecture = OKLCH + a tiny generative core + explicit token tiers.** Build
   primitive ramps in OKLCH; express themes through a small generative set in the
   `surface` / `accent` / `contrast` spirit (validated by Linear/Codex); model semantic
   steps on Radix's 12-step roles (filling the missing hover/pressed/focus states); split
   primitive → semantic token tiers in the existing `@theme` layer; defer component
   tokens. This gates contrast, theming, and the grayscale-safe tier guarantee.
4. **Warmth is restrained and token-level (the Claude lineage), not decorative.** Warm
   low-chroma neutrals (carried into dark) + one muted earthy accent + soft rounded depth
   + alive micro-interactions + human copy tone. Guardrail: contrast, diff legibility,
   density, and reactivity override warmth on conflict.
5. **Iconography = hybrid.** A conventional set (Lucide) for structural chrome; the
   expressive node / tier / state / event marks may carry a restrained hand-finished
   quality (the tactile signature), but the full distinctive hand-drawn *brand* family is
   not the target — consistent with the structural/expressive charter split and the
   trend-follower stance.
6. **Typography = system/variable UI sans + dedicated mono**, with separate UI vs code
   type scales (the cohort pattern); compact instrument scale; `tabular-nums` on data;
   no bundled identity face for a web-served tool.
7. **Motion = fast, subtle, reactive, state-communicating.** Keyboard-initiated actions
   never animate; UI animation is short; reduced-motion swaps to instant; the diff/replay
   transition grammar follows the *Animated Transitions* rules (§F).
8. **Density = compact-but-breathing, alignment-obsessed, dimmed chrome.**
9. **Scope = language + UX principles only.** The layer-by-layer implementation plan is a
   separate later cycle.

**Product-specific layers preserved on top of the base language** (unchanged by the
pivot): tier-as-treatment with grayscale-safe identity; bounded-by-default graph; the
per-tier tiers truthfulness mechanism rendered as designed degraded states; time-travel
mode honesty; the state-isolation invariants (§G).

These map onto the owned layers without disturbing them: the language is carried by the
shared `:root` token layer (chrome + scene), surfaces stay dumb views projecting over the
one model via stores selectors, and the engine remains read-and-infer. The ADR can
therefore pin the design language without reopening the architecture.
