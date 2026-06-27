---
tags:
  - '#adr'
  - '#dashboard-rag-manager'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-rag-manager` adr: `rag server manager` | (**status:** `accepted`)

## Problem Statement

The dashboard's right rail carries pillar 2: the operational control surface for the
sibling services the engine fronts. This ADR scopes the slice of that surface that
manages the rag semantic-search service — its lifecycle (start / stop), its maintenance
verbs (reindex, watcher tuning), and the status rollup that tells the operator whether
rag is up, whether its index is present, and how much work is in flight. The rag service
is the most operationally live of the siblings: it has a heavy GPU model load, a resident
watcher, and a job queue, so the operator genuinely needs a hand on its lifecycle from
the dashboard rather than dropping to a terminal.

The current implementation predates the base design-language redefinition. Its control
buttons in `OpsPanel.tsx`, the dispatch seam in `opsActions.ts`, and the rag rollup card
in `NowStrip.tsx` are wired correctly against the contract but skinned in the retired
paper-warm token vocabulary (`bg-paper-sunken`, `text-state-stale`, hand-drawn iconless
text labels). This ADR re-pins the rag manager surface onto the inherited base UI design
language and the bespoke iconography decision, re-deciding nothing about the wire
contract or the four-layer architecture, both of which are settled and stable. It is spec
work: it codifies what the rag manager is and the UX laws it obeys, and it authorizes no
application-code change on its own.

## Considerations

The decision inherits the base UI design-language ADR and the iconography ADR in full and
re-opens neither; it grounds the surface against the foundation contract reference's ops
proxy and status sections, and it reads the current code as the starting point.

- **Current form — the control surface.** `OpsPanel.tsx` renders the R1 whitelist
  verbatim (`OPS_WHITELIST`): the rag rows are `service-start` ("start rag"),
  `service-stop` ("stop rag"), `reindex`, and `watcher-reconfigure` ("watcher tuning"),
  alongside the two core verbs. Each row is an `OpsButton` carrying its own arm-to-confirm
  slot via the platform `useConfirmable` guard keyed on `ops:{target}:{verb}`, so arms
  never cross-fire; the armed state swaps the label for a "confirm {label}?" button plus a
  cancel link. Every button disables in time-travel mode and while a mutation is pending.
  Firing routes through `dispatchOps` (the one platform dispatch seam), and the panel
  shows a single trailing `lastResult` line. The styling is entirely retired-vocabulary
  tokens and text-only labels — no icons, no in-flight liveness cue beyond the disabled
  state.

- **Current form — the status rollup.** `NowStrip.tsx`'s `ragCard` is the rag rollup: it
  reads `status.rag` from the `/status` recovery snapshot (typed `{ service, watcher?,
  index?, jobs? }`), renders "down/absent" when the service is not running, and otherwise
  a one-line detail of `watcher · index · jobs`. The strip refreshes on the `backends` and
  `git` SSE channels through a debounced `/status` invalidation. Tones are mapped to the
  retired token palette.

- **What the base language requires.** The convergent agentic-desktop register: the shared
  `:root` OKLCH token tier (no retired paper tokens), restraint (one muted accent, no
  gradients), structure felt not seen (subtle elevation, soft rounded low-contrast
  borders), the per-tier `tiers` truthfulness mechanism rendered as designed degraded
  states, fast subtle state-communicating motion with `prefers-reduced-motion` honored and
  keyboard actions instant, tabular numerals on all data-bearing counts (jobs, index
  state), and the instrument-grade "completion as a legible receipt" grammar for the
  result of an op. The Codex thinking-state lesson — a small purposeful liveness cue tied
  to real in-progress work — is exactly the in-flight feedback an ops button wants.

- **What the iconography ADR requires.** Structural chrome marks come from Lucide; the
  rag manager's marks (start, stop, reindex/refresh, watcher/settings, the service/index
  status indicators) are conventional structural chrome and therefore Lucide, single
  `currentColor` ink over the shared token layer, never load-bearing on hue, legible and
  shape-distinct at 14px. No bespoke domain mark is introduced here; the four tier marks
  and species glyphs are not part of this surface.

- **What the ops-proxy contract requires.** Foundation reference section 6: the dashboard
  talks only to the engine; sibling operations pass through the transparent, namespaced
  `/ops/rag/{verb}` proxy that forwards whitelisted verbs and returns the sibling envelope
  verbatim plus the section-2 degradation block, with a 502-with-tier-block when rag is
  down. Section 10 R1 fixes the whitelist as exactly the pillar-2 list. The `/status`
  rollup (section 6) is the rag service/watcher/index/job snapshot, recovered per
  section 7 with the `backends` SSE channel carrying rag job/index/watcher transitions.

## Constraints

- **Engine is read-and-infer; no rag semantics anywhere on the path.** The engine only
  forwards whitelisted rag verbs verbatim through `/ops/rag/{verb}` and returns the
  sibling envelope untouched. The dashboard must grow no rag semantics either: it must not
  interpret, retry, re-argument, or "fix up" a rag result, must not synthesize a verb the
  whitelist does not contain, and must not reconstruct rag job/index logic client-side. A
  new rag operational need is a whitelist addition filed upstream against the contract, not
  a GUI-side capability. The `OPS_WHITELIST` constant is the R1 list verbatim and is never
  grown GUI-side.

- **Ops only through the whitelisted proxy and the one dispatch seam.** Every rag op flows
  through `dispatchOps` → the platform `appDispatcher` → `engineClient.opsRag(verb)` →
  `POST /ops/rag/{verb}`. No component issues a direct `fetch`, no ad-hoc client call
  bypasses the seam (so every op stays logged, traced, and centrally guardable), and the
  dashboard never reaches rag's loopback service directly — only the engine does.

- **Arm-then-confirm on every op.** Each rag op is a two-step interaction: the first
  activation arms the platform confirm guard for that op's unique slot; a second, distinct
  activation confirms and fires; an explicit cancel disarms. Arms are per-op so one armed
  button can never fire another. Stopping rag, reindexing, and retuning the watcher are all
  consequential enough to require the deliberate second step.

- **Disabled in time-travel.** Every rag op disables whenever the view is in time-travel
  mode (`timelineMode.kind === "time-travel"`): history is read-only, and mutating a live
  sibling from a historical view would be incoherent. The disabled state is a designed,
  explained state, not an error.

- **Reads status truth via stores, never the raw wire.** The rag rollup is read through
  the stores layer's status query and SSE hooks (`useEngineStatus`, `useEngineStream`),
  which own the fetch, the cache, and the section-2 `tiers`/`degradations` block. The
  chrome surface renders that truth and dispatches intent; it never fetches the engine and
  never reads the raw `tiers` block itself. Rag-down, rag-absent, and stream-lost are
  rendered as designed degraded states sourced from that truth, never as failures.

- **What it must NOT do.** It must not author or mutate any `.vault/` document; must not
  expand the whitelist; must not add a rag verb, filter, or option the engine does not
  forward; must not render an op result as anything other than the verbatim sibling
  outcome plus tier truth; must not animate keyboard-initiated confirms; and must not let
  hue carry status meaning without a redundant shape/text channel.

## Implementation

The rag server manager is a thin, honest control-and-status surface over the engine's
transparent rag proxy, re-skinned onto the base language. Scope is exactly three pieces of
app-chrome: the rag rows of the ops panel (`OpsPanel.tsx`), the dispatch path
(`opsActions.ts`, unchanged in behavior), and the rag rollup card (`NowStrip.tsx`).

**The status rollup (index present, jobs, readiness).** The rollup is a projection over
the one model's `/status` snapshot, surfaced by the stores status query and refreshed by
the `backends` SSE channel through the existing debounced `/status` invalidation. It
renders rag readiness as a legible receipt: a service indicator (running / stopped /
absent), the watcher state, an index-present indicator, and the in-flight job count, the
count and any numeric index figure set in tabular numerals. Readiness is the composite —
rag is "ready" only when the service is running, the index is present, and the watcher is
live; the card states that composite plainly rather than making the operator infer it.
Status meaning is carried by a Lucide structural mark plus text first, with the single
muted accent or a semantic state token as redundant reinforcement, so the rollup survives
grayscale. The card uses the shared `:root` semantic tokens, subtle elevation, and a soft
rounded low-contrast border — no retired paper tokens.

**The managed ops as arm-then-confirm buttons.** The four rag verbs render as a compact
button cluster: start rag, stop rag, reindex, watcher tuning, each labeled with a
conventional Lucide chrome mark (play / stop / refresh / settings) and concise approachable
copy. Each is the existing per-op `useConfirmable` two-step: a resting button arms on
first activation, swapping in place to an accented "confirm?" affordance with an explicit
cancel; the second activation disarms the guard and dispatches the verb through the seam.
The cluster is contextual: start rag is offered when rag is stopped or absent; stop /
reindex / watcher tuning are offered when rag is running. All four disable wholesale in
time-travel mode with the existing explained notice.

**In-flight and result feedback.** While a verb is dispatched, its button enters a
purposeful liveness state (the Codex thinking-state lesson) — a small inline spinner or
pulsing mark tied to the real pending mutation, with the whole cluster disabled to prevent
overlap, all suppressed under `prefers-reduced-motion` in favor of an instant state swap.
On settle, the op shows a legible receipt: a transient ok / failed line derived verbatim
from the sibling envelope's outcome, and a successful op invalidates the `/status` query
so the rollup reflects the new reality. A rag-down 502 surfaces as the section-2 tier
truth in the receipt, distinguishing "the backend is down" from "your request was wrong",
never as a generic error.

**States.** The surface renders, as designed states: loading (status query in flight —
skeletoned rollup, ops disabled until truth arrives); idle (rag running and ready — full
cluster armed-capable); rag-stopped and rag-absent (the rollup shows the stopped/absent
state and the cluster offers only start rag — degradation as design, not error); degraded
per `tiers` (the section-2 block absent or partial — the rollup says so honestly and ops
that depend on a live rag are visibly unavailable); in-flight (per-op liveness); and error
(engine unreachable — the strip's existing honest "start it with `vaultspec serve`"
notice, ops inert).

**Keyboard and a11y.** The control cluster is fully keyboard-operable: each button is a
real focusable control, the two-step arm-then-confirm flow is reachable and completable by
keyboard (arm focuses the confirm affordance; cancel and Escape disarm), and
keyboard-initiated activations are instant — never animated. Focus is visible via the
semantic focus-ring token. State transitions and op outcomes are announced to assistive
technology through a polite live region (armed, firing, result, rag became
stopped/running) so a non-sighted operator tracks the confirm flow and the rollup without
sight. Status and result meaning never rely on hue alone; the Lucide marks carry
`aria-label`s and `prefers-reduced-motion` removes the liveness animation.

**Layer ownership and projection over the one model.** The rag manager lives wholly in
app-chrome (`frontend/src/app/right/`). It dispatches ops through the platform seam, which
reaches the engine's `/ops/rag/*` proxy via the stores client; it reads rag status through
the stores status query and SSE hooks; it never fetches the engine directly, never reads
the raw `tiers` block, and grows no rag semantics. The rollup is a projection over the
single model's status snapshot, not a new model nor a new wire path. The styling is
delivered entirely through the shared `:root` token layer with base tokens, motion grammar,
density, and Lucide chrome icons; nothing new is invented.

## Rationale

The surface's wiring is already contract-correct — transparent proxy, R1 whitelist
verbatim, arm-then-confirm via the platform guard, time-travel disabling, dispatch through
the one seam, status read via stores. That correctness is the reason this ADR re-decides
none of it: re-opening the wire contract or the layer boundaries would be premature
authoring against settled, stable parent features. What is genuinely out of date is the
skin, which still speaks the retired paper-warm vocabulary the base design-language ADR
deliberately set aside in favor of the convergent agentic-desktop register. Re-skinning
onto the shared token layer and Lucide chrome marks is the whole substance of the change.

Treating rag readiness as a legible receipt and op outcomes as verbatim sibling receipts
follows the base language's instrument-surface grammar and keeps the engine's
read-and-infer honesty intact: the dashboard shows what rag and the engine report, never a
synthesized interpretation. The purposeful in-flight liveness cue applies the Codex
thinking-state lesson precisely where the brief sanctions it — genuine in-progress work
tied to real state. Carrying status by mark-and-text first, with hue as redundant
reinforcement, satisfies the non-negotiable grayscale-safe identity gate inherited from
both parent ADRs.

## Consequences

- **Gains.** The most operationally live sibling gets a control surface native to the
  agentic-desktop cohort: legible readiness at a glance, conventional Lucide marks, a
  deliberate arm-then-confirm flow, honest degraded states, and theme-correct rendering
  across dark, light, and high-contrast for free via the shared token layer. The
  read-and-infer boundary and the single-seam discipline are preserved, so the surface
  stays a thin window onto rag rather than a second home for rag logic.

- **Costs and difficulties.** The in-flight liveness cue must be tied to the real pending
  mutation and fully suppressed under reduced motion, which is genuine a11y work; the
  composite "readiness" judgment must be derived only from the fields the `/status`
  snapshot actually carries, never invented; and the result receipt must surface the
  section-2 tier truth rather than a flattened error string, which means the receipt path
  must read the degradation block the stores layer exposes.

- **Risks.** The standing temptation under a "rag manager" framing is to grow rag
  semantics GUI-side — a synthesized verb, a client-side retry, a richer job view the
  whitelist does not back — which would breach the read-and-infer boundary; the whitelist
  and seam disciplines are the guard, and any real new need is an upstream contract filing.
  A second risk is letting status tone drift to hue-only under the new accent discipline,
  eroding the grayscale gate.

- **Pathways opened.** A consistent ops-receipt and readiness-rollup template here gives a
  reusable pattern for the sibling core ops and any future whitelisted verb; the shared
  token and icon approach keeps the surface aligned as the base language evolves.

## Codification candidates

None. The constraints this surface honors are already codified in existing project rules —
`engine-read-and-infer` (forward whitelisted verbs verbatim; no rag semantics in engine or
dashboard), `dashboard-layer-ownership` (chrome dispatches and reads through stores, never
fetches), `views-are-projections-of-one-model` (the rollup projects the one status
snapshot), and `every-wire-response-carries-the-tiers-block` (the rag-down 502 surfaces as
tier truth). This ADR applies those settled rules to one surface and introduces no new
durable cross-session constraint, so promoting a new rule would fragment discipline
already captured. The arm-then-confirm and ops-disabled-in-time-travel patterns are
likewise behaviors of the platform confirm guard and the GUI ADR, not new obligations this
feature originates.
