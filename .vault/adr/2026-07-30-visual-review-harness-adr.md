---
tags:
  - "#adr"
  - "#visual-review-harness"
date: '2026-07-30'
related:
  - "[[2026-07-30-visual-review-harness-research]]"
  - "[[2026-06-25-state-mode-uniformity-adr]]"
  - "[[2026-06-15-figma-design-bridge-adr]]"
  - "[[2026-06-17-management-engine-optimization-audit]]"
superseded_by: '2026-07-31-visual-review-authored-states-adr'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:5ad22d47ab349e2b0596674ca5b86c97510d2144f110748d8fba3e58461f4cfa'
---
# `visual-review-harness` adr: `modes are rendered not simulated; a fenced dev domain with an iframe matrix harness` | (**status:** `superseded`)

## Problem Statement

There is no surface on which a reviewer can see every implemented visual element across the
axes that actually vary it - theme, canonical state mode, and viewport class. The gap is
not new: an accepted decision already adopted a component gallery, it was built in full,
and it was then removed because it depended on a seeded engine wire to render populated
chrome - an authored double sitting outside the test gates, in direct conflict with the
standing rule that the frontend never mocks, stubs, or fakes the engine wire.

Rebuilding a gallery without settling that conflict would reproduce the same failure. Two
further problems compound it. The preview concern has already leaked across the production
boundary - a shipped component carries a dev-only override prop, dev-only code sits in the
production stores layer, and dev-only copy compiles into the shipped localization catalog.
And five existing harnesses each invented their own incompatible way to preview a state, so
there is no shared notion of what "render this element in its degraded state" even means.

Meanwhile `state-mode-uniformity` D6 requires Figma and frontend to stay visually
identical and flags its parity check as unmet, with no surface anywhere that renders the
four canonical modes together.

## Considerations

- The engine wire may never be mocked, stubbed, or faked (`wire-contract` rule); this is the
  force that invalidated the prior gallery per `final-execution-005` in
  `2026-06-17-management-engine-optimization-audit`.
- The four canonical modes and their shared presentational primitives are already fixed and
  accepted (`2026-06-25-state-mode-uniformity-adr` D1 and D4), and D6's parity check is
  unmet - so the mode axis is inherited, not invented.
- A gallery was already adopted, built and removed (`2026-06-15-figma-design-bridge-adr`
  D3(a); plan steps `W02.P06.S24`-`W02.P07.S33`; commit `034088a1a3`), so this decision must
  amend an accepted record rather than pretend to be net-new.
- Viewport class is read from the real window (`frontend/src/stores/view/viewportClass.ts:38-41`)
  and theme from the document root (`frontend/src/platform/theme/themeController.ts`), which
  together bound what a single-document harness can honestly render.
- The production boundary has already failed in four independent places, catalogued in
  `2026-07-30-visual-review-harness-research`, so a rule without a gate is not credible.
- Both the px and localization scanners currently report zero findings, and harness chrome
  authored under `src/` would breach the latter.

## Considered options

- **Reinstate a third-party gallery (Storybook or Ladle).** Mature ecosystem and the
  industry-standard mode matrix. Rejected: it was already adopted and removed here, it adds a
  parallel documentation plane conflicting with the Figma name-as-contract rule, and it does
  nothing to solve the seeded-wire conflict that actually killed it.
- **Seed the wire in the browser (fixture responses, MSW, an authored double).** Simple and
  gives populated chrome cheaply. Rejected outright: it is the exact mechanism the audit
  banned, and it puts review data outside backend confidence.
- **Drive whole containers via preview props or forced stores.** Cheap and already partly
  built (`StatusTab.stateOverride`). Rejected: it embeds dev concern in shipped production
  code, which the separation mandate forbids, and it scales to a bespoke override per surface.
- **Render mode-bearing presentational views directly with props (chosen).** Needs no wire,
  is deterministic, and reuses primitives that an accepted ADR already extracted. Cost: it
  requires splitting derivation from presentation on each surface first.
- **Serve every specimen from the real engine over the committed fixture vault.** Maximum
  fidelity and no double. Kept, but narrowed to the integrated-specimen minority: it needs a
  running backend and cannot deterministically pin `loading` or `degraded`.
- **Container queries instead of iframes.** The modern component-responsiveness answer.
  Rejected on mechanism: they cannot change what `window.matchMedia` reports to the
  application's own responsive switch, so the shell would still render its desktop frame.

## Decisions

- **D1 - Modes are RENDERED, never simulated.** Every canonical mode (`typical`,
  `loading`, `degraded`, `empty`) is reached by rendering a presentational component with
  props - never by seeding a wire, faking a response, forcing a store, or overriding a
  derivation. This is possible because `state-mode-uniformity` D4 already extracted the
  modes into exactly such components: `Skeleton` and `StateBlock` in
  `frontend/src/app/kit/`, and `RailLoading` / `RailEmpty` / `RailDegraded` in
  `frontend/src/app/right/railStates.tsx`. Rendering one of those with props is not a
  simulation of a state - it *is* the state, in the same sense that rendering a disabled
  Button is not a simulation of disabled. The prior gallery needed a fake wire only because
  it drove whole wire-bound containers and had no other way in; it was solving the wrong
  problem.

- **D2 - Data-bearing surfaces split derivation from presentation.** A surface that renders
  a mode is refactored into two parts: a **container** that derives the mode from stores and
  the `tiers` block exactly as today, and a **view** that receives the resolved mode as a
  required prop and holds no wire access. The harness enrolls the view; production composes
  container over view. This is what retires the dev-only override: `stateOverride` at
  `frontend/src/app/right/StatusTab.tsx:765`, consumed at `:782`, is DELETED outright, with
  `StatusTab` keeping derivation and a new `StatusTabView` taking `railState` as a required
  prop. The override existed only because presentation was welded to derivation; once split,
  nothing needs to override anything. The split is a genuine architectural improvement that
  happens to make the surface reviewable - not a harness affordance pushed into production.

- **D3 - Integrated specimens read the REAL engine over the committed fixture vault.** Where
  a whole composed surface is worth reviewing end-to-end rather than as a view, it is served
  by a real `vaultspec serve` over `frontend/src/testing/fixtures/`, reusing the existing
  live-engine harness seam, and it renders whichever mode that real data genuinely implies.
  An authored engine double is forbidden here permanently, and the ban is explicitly
  inherited from audit finding `final-execution-005`. Integrated specimens are the minority
  case; D1/D2 view specimens are the default because they are deterministic and need no
  backend.

- **D4 - A specimen carries a state axis if and only if it is a mode-bearing view.** A
  stateless primitive declares none and renders once per theme and viewport - a Button has
  no `empty` mode and padding the matrix with one would be a lie. A mode-bearing view
  declares exactly the modes it genuinely supports, and declaring a mode obliges the
  specimen to render it. This keeps the matrix honest rather than combinatorially inflated.

- **D5 - One state vocabulary, one railStates module.** The ADR vocabulary wins: `typical`
  replaces `populated` at `frontend/src/app/right/railStates.tsx:14`, closing the drift
  against `state-mode-uniformity` D1. The two competing modules -
  `frontend/src/app/left/railStates.tsx` and `frontend/src/app/right/railStates.tsx` - are
  merged into one definition in the kit, since a mode primitive is by definition shared and
  a per-rail copy is how vocabulary drifts in the first place.

- **D6 - Supersedes `figma-design-bridge` D3(a).** The retired third-party gallery is
  replaced by a harness native to the existing Vite builder, carrying no new runtime or
  build dependency. Each matrix cell renders in an **isolated iframe** at its true device
  width, visually scaled to fit the reviewing screen. The iframe is forced, not preferred:
  `frontend/src/stores/view/viewportClass.ts:38-41` reads `window.matchMedia` against the
  real window, so a narrow container would report `regular` and paint the desktop shell at
  phone width, and `themeController.ts` sets `[data-theme]` on `document.documentElement`,
  so one document holds exactly one theme. The axes are declared centrally in one module -
  themes `light`/`dark` with `high-contrast` opt-in, viewports mobile 390x844 and desktop
  1440x900, and the four modes - and every specimen declares a size class so an inline chip
  is never framed at 1440px.

- **D7 - Production and dev are fenced domains with a one-way import law.** All non-production
  code lives under `frontend/dev/`: the new harness plus the five rehomed labs, their HTML
  entries, and the dev-only modules currently inside production
  (`frontend/src/stores/view/threeLabVocabulary.ts`, which has zero production consumers, and
  the three-lab localization modules wired in at
  `frontend/src/localization/messagePolicy.ts:9`, whose removal takes dev copy out of the
  shipped catalog). `dev/**` may import `src/**`; `src/**` importing `dev/**` is a build
  failure. Enforced by a scanner wired into `just dev lint frontend` beside the existing
  `lint:px` and `lint:localization` gates, and codified as a project rule. The gate also
  fails a reintroduced preview-override prop and any dev HTML entry at the frontend root.

## Constraints

The `wire-contract` rule forbidding a faked engine wire is inherited and non-negotiable;
it is what invalidated the previous design and it binds this one. `architecture-boundaries`
keeps stores as the sole wire client, so a harness never fetches - D1/D2 views take props
and D3 integrated specimens go through stores unchanged. The design-system rules bind the
harness's own chrome: no hardcoded px, and its labels must not enter the shipped
localization catalog, which D7's rehoming resolves structurally by moving them out of
`src/`.

D2 is the load-bearing constraint on effort: every mode-bearing surface must be split
before it can be enrolled, so specimen coverage of composed surfaces is gated on that
refactor rather than on harness work. Both localization and px scanners currently report
zero findings, and D7 is what keeps them there.

### Discovered constraint 2026-07-31 — type-safe keys close the catalog

D7 assumed dev copy could simply be moved out of the shipped localization catalog. Execution
found a hard blocker, and the S15 attempt was reverted byte-for-byte.

`MessageKey` is a mapped type over `EnglishResources` = `typeof en`
(`frontend/src/platform/localization/message.ts:12`). The key union is therefore CLOSED over
the shipped catalog. Removing `graph:lab.*` from `frontend/src/locales/en/graph.ts` removes
those keys from the type, and the three-lab surface loses compile-time key safety — 82 type
errors across 4 files and 79 call sites.

Restoring that safety would require the production key type to know about dev-only keys,
which the one-way import law in D7 forbids (`src/**` may not import `dev/**`). The two rules
are in genuine conflict for this one case; it is not a mechanical migration.

The options, none free:

1. **Lab-local typed catalog.** Derive a `LabMessageKey` from the lab's own message object
   in `dev/`, with one cast at the runtime boundary. Keeps both separation and type safety;
   costs ~80 call-site edits in the lab.
2. **Lab uses untyped keys.** Cheapest, but a dev harness loses the guarantee that a key
   exists — the very class of defect the localization campaign existed to remove.
3. **Accept the leak.** ~90 dev-only strings stay in the shipped catalog. Bounded and
   documented, but the fence has a hole and `production-dev-separation` overstates itself.

Until this is decided, three-lab's copy REMAINS in the shipped catalog. The dev CODE is
fully rehomed and gate-enforced; only the copy leaks. Recorded here so the gap is visible
rather than silently carried.

### Amendment 2026-07-31 — the closure is enforced at RUNTIME, not only in types

The option chosen above (1, lab-local typed catalog) was attempted and reverted
byte-for-byte. The earlier estimate of ~80 call-site edits was wrong because it assumed
the barrier was type-level. It is not.

`normalizeMessageDescriptor` (`frontend/src/platform/localization/message.ts:318`) calls
`isOrdinaryMessageKey(record.key)` and returns `null` for any key absent from the shipped
`MESSAGE_KEYS`. `resolveMessageResult` then falls back to the safe message
(`frontend/src/platform/localization/fallback.ts:164-183`). So the app resolver
DELIBERATELY refuses unknown keys at runtime — a real safety property that stops a typo
leaking a raw key to a user.

This was proven empirically during the attempt: after `addResourceBundle`, a direct
`i18n.t("graph:lab.accessibility.simulationPanel")` returned the correct string, while the
same key rendered through `useLocalizedMessage` produced the safe-fallback copy. The
bundle was registered; the resolver rejected the key.

**Consequence for option 1:** a lab-local key TYPE is insufficient. The lab would also
need its own resolver, duplicating descriptor normalization, plural handling, values
normalization, and fallback semantics in `dev/` — replicating a safety-critical path
rather than reusing it. That is a materially larger and riskier change than a type alias,
and it is the third distinct blocker found in this one step.

**Standing state:** three-lab's ~90 dev-only strings REMAIN in the shipped catalog. The
dev CODE is fully rehomed and gate-enforced; only the copy leaks, and the leak is bounded,
measured, and recorded here. `production-dev-separation` should be read with this
exception in mind until it is resolved deliberately.

## Implementation

Staged so the harness is usable before the deepest detangle: the dev domain and harness
with the kit primitives enrolled; the shallow rehome of the four `*-visual` labs and the
HTML entries; the enforcement gate; the three-lab detangle including the catalog unwiring;
the D2 container/view splits with `stateOverride` deleted and mode-bearing views enrolled;
and a coverage guard asserting every kit export has a specimen and every declared mode
renders, so the harness cannot silently drift as the kit grows.

## Rationale

The research is decisive that the prior attempt failed on one specific point - it needed
populated chrome and reached for a fake wire to get it. D1 dissolves that rather than
negotiating with it, and it can only do so because an earlier accepted decision had already
done the necessary work of extracting the modes into presentational primitives. D2 then
explains why the fake wire ever seemed necessary: presentation welded to derivation leaves
no seam except the wire itself. Splitting them is the smallest change that makes the
surface reviewable, and it is independently correct.

D6's iframe is not a design preference but a mechanical consequence of two facts in this
codebase, which is also why the container-query alternative fails - it can size a component
but cannot change what the application's own responsive switch reads from `window`.

D7 follows from the evidence that the boundary has already failed in four distinct places;
a rule without a gate would fail again the same way.

## Consequences

**Gains:** the unmet parity verification required by `state-mode-uniformity` D6 finally has
a home; a dev-only prop, a dev module in the production stores layer, and dev copy in the
shipped catalog all leave production; the state vocabulary is unified; and the harness
carries no new dependency.

**Honest costs:** D2 is a real refactor across every mode-bearing surface, and it must land
before those surfaces can be reviewed - the harness will cover kit primitives well before
it covers composed surfaces. Integrated specimens under D3 need a running engine and are
non-deterministic by nature, which is why they are the minority path. The rehome touches
many files shallowly and will conflict with concurrent work in the same tree.

**Corpus defect raised, not fixed here:** the global find-replace that scrubbed the retired
tool's name left accepted ADR prose ungrammatical (`figma-design-bridge` D3(a) reads "adopt
retired component gallery as the component gallery") and corrupted unrelated passages at
`2026-06-12-dashboard-gui-adr.md:419,762`. This warrants a curation pass.

### Amendment 2026-07-31 — D5 narrowed during execution

D5 as written required merging `frontend/src/app/left/railStates.tsx` and
`frontend/src/app/right/railStates.tsx` into one kit definition. Execution found that
premise wrong. The two modules are not duplicates: `right/railStates.tsx` exports the
four-mode primitives (`RailEmpty`, `RailDegraded`, `RailLoading`), while
`left/railStates.tsx` exports differently-shaped left-rail components (`RailSkeleton`,
`RailMessage`, `RailDegradedNotice`). Same concern, different shapes — a merge would have
been a refactor justified only by this ADR's own text rather than by the code.

**What D5 now binds:** the vocabulary unification only. `populated` is retired in favour of
`typical` at `frontend/src/app/right/railStates.tsx`, closing the drift against
`2026-06-25-state-mode-uniformity-adr` D1. The module merge is NOT part of this decision;
if the two rails' mode presentation should converge, that is its own decision with its own
evidence.

Recorded here rather than silently dropped: an ADR that overstates what was built is worse
than one that records being narrowed, because the next reader would take the merge as
done.

### Delivered scope 2026-07-31 — what is enrolled, and what is not

**S15 resolved.** The earlier "runtime closure" constraint above was correct about the
mechanism but wrong about the cost. The ~79 lab call sites do not each call the resolver:
they funnel through FIVE sites (four `useLocalizedMessageResolver()`, one
`useLocalizedMessage()`). Making those funnels lab-aware left every call site untouched.

The lab now carries `dev/labs/three/labMessage.ts` — its key type derived from its own
catalog, and a resolver that translates the lab's own keys directly while delegating every
PRODUCTION descriptor to the production resolver unchanged. Production keeps its fallback,
plural, and values semantics for product copy; only the lab's keys, which that resolver is
designed to reject, take the direct path. Three-lab's ~90 strings no longer ship, and the
lab still type-checks against its own catalog. Verified in-browser: the lab renders its own
copy including a plural key, with no safe-fallback leak.

**Mode-bearing surfaces — partial by design.** Twelve surfaces compose `StateBlock` or
`Skeleton`. Enrolled: the status rail (via the D2 split) and the left-rail state bodies
(already wire-free, so they enrol as-is). NOT enrolled: `AgentPanel`, `DiffPanel`,
`DiffView`, `ReviewStation`, `NodeInterior`, `CodeTree`, `FolderBrowser`,
`CommandPalette`, `DocumentSearchSurface`. Each needs its own D2 container/view split, and
each split is a reviewed change to a shipped surface — that is a campaign, not a step. The
harness is built to absorb them one at a time: enrolling a surface after its split is a
single registry entry.

**Why the lab resolver is safe, verified rather than assumed.** Bypassing
`resolveMessageResult` for lab keys looked like it would forfeit the safe-fallback
guarantee — a missing key leaking raw to the UI. It does not.
`parseMissingKeyHandler: safeMissingMessage` is configured on the i18next INSTANCE
(`frontend/src/platform/localization/runtime.ts:52`), so any unresolved key returns the
safe message regardless of which resolver asked. Confirmed empirically: translating a lab
key on a runtime where `registerLabMessages` was deliberately NOT called returns "This
content is unavailable. Reload the page and try again.", not the raw key. The lab path
inherits the property rather than re-implementing or losing it.

## Codification candidates

The one-way dev/production import law and the ban on preview affordances in production
components are both durable rules, and D7's gate is their enforcement.
