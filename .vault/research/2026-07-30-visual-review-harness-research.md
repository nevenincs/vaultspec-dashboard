---
tags:
  - '#research'
  - '#visual-review-harness'
date: '2026-07-30'
modified: '2026-07-30'
body_schema: 'body-v1'
body_hash: 'sha256:a052ad820167cc446f7f0496bdb3018a84f6a82267836b2cb853cf8410a52c60'
related:
  - "[[2026-06-15-figma-design-bridge-adr]]"
  - "[[2026-06-25-state-mode-uniformity-adr]]"
  - "[[2026-06-17-management-engine-optimization-audit]]"
---

# `visual-review-harness` research: `canonical visual review harness for every UI element in theme, state, and viewport`

The dashboard has no surface on which a reviewer can see every implemented visual element
rendered across the axes that actually vary it: theme, state, and viewport class. This
research grounds the question of how to build one.

The decisive finding is that this is not net-new work. A component gallery was already
adopted by an accepted ADR, built in full, and then removed - and the reason it was removed
is the same architectural problem any replacement must solve. A second finding is that the
obvious cheap implementation (render every variant into one page) cannot work in this
codebase for mechanical reasons, so the option space is narrower than it first appears.

The evidence favors an iframe-isolated matrix harness whose data-bearing specimens are
populated by the real engine over the committed fixture vault rather than by any authored
double. What the ADR must settle is the single seam by which a harness drives a production
surface into a canonical state mode without reintroducing the fake wire that killed the
prior attempt, and whether the dev/production separation this implies is one decision or
two.

## Findings

### A component gallery was already accepted, built, and removed

`.vault/adr/2026-06-15-figma-design-bridge-adr.md` carries status `accepted`, and its
Decision 3(a) adopts a component gallery as the "seeding + parity substrate", chosen for
its Vite builder matching the project stack. The tool it named was Storybook. The vault was
later globally find-replaced to scrub that name, which left the accepted decision text
ungrammatical and self-contradictory - it now reads "adopt **retired component gallery** as
the component gallery". The same substitution damaged `2026-06-12-dashboard-gui-adr.md:419`
and `:762` (where it corrupts unrelated prose listing localhost web-app precedents) and
`2026-06-15-figma-design-bridge-research.md:63,202`.

The gallery was then built to completion. In
`.vault/plan/2026-06-15-figma-design-bridge-plan.md`, steps `W02.P06.S24` through `S26`
stood up the gallery and its theme switcher, and `W02.P07.S27` through `S33` authored
stories covering foundations, the left-rail chrome, the stage region, the right-rail
region, the timeline region, the islands/palette/menu regions, and the shared domain marks.
Every one is marked complete. The work landed in commit `034088a1a3`. Those step rows now
carry scope clauses reading "removed gallery configuration" and "removed component-gallery
file", recording the later teardown in place.

The practical consequence is that a full inventory of what a gallery must cover already
existed once and can be recovered from those step rows, and that the current frontend
`package.json` carries no gallery dependency of any kind.

### The gallery was removed because it depended on a fake engine wire

`.vault/audit/2026-06-17-management-engine-optimization-audit.md` finding
`final-execution-005` records the rationale directly. The default frontend source test tree
had just been purged of its authored engine double, and `frontend/src/testing` no longer
exported it - but "a seeded engine wire remains under [gallery] support so design surfaces
can render populated chrome". The audit classes it as sitting "outside Vitest and outside
backend confidence" and instructs that it "should not be reintroduced into
`frontend/src/testing` or backend-facing tests". Finding `final-review-007` adds that
gallery-only seeded data must stay contained.

This collides with the project's standing wire rule, which requires the frontend suite to
run online against a real `vaultspec serve` origin and forbids mocking, stubbing, or faking
the engine wire. The gallery's need to show populated chrome without a live backend is
precisely what put it in conflict.

The constraint this places on any replacement is hard: a design that requires an authored
engine double to populate a data-bearing surface repeats the retired mistake. A candidate
the prior attempt did not have available in the same form is the live-engine harness at
`frontend/src/testing/liveEngine.globalSetup.ts`, which already spawns a real engine over
the committed fixture vault under `frontend/src/testing/fixtures/` and publishes its base
URL and token - a real wire over deterministic data rather than a fake wire over invented
data.

### Isolated browsing contexts are forced, not a stylistic preference

Two independent mechanisms make a single-document gallery incapable of rendering this app
honestly.

The viewport class is read from the real window. `frontend/src/stores/view/viewportClass.ts`
resolves compact versus regular through `window.matchMedia` against a `max-width` query at
the 40rem breakpoint (`:29-30`, `:38-41`), and feeds that signal into the shell projection
so the same projection emits either the desktop three-column grid or the compact
single-pane frame. A narrow container element does not change `window.matchMedia`, so a
shell rendered inside a 390px-wide `div` would report `regular` and paint its desktop
layout at phone width - a confident, silent lie precisely where a reviewer is looking for
truth.

The theme is applied to the document root. `frontend/src/platform/theme/themeController.ts`
sets `[data-theme]` on `document.documentElement` and keeps `color-scheme` in sync; the
token layer remaps the semantic tier under that selector. One document therefore holds
exactly one theme, so light and dark cannot coexist on a page without separate browsing
contexts.

Container queries, the usual modern answer to component-level responsiveness, do not
resolve this. They can style a component by its own width, but they cannot change what
`window.matchMedia` reports to the application's own responsive switch. The codebase uses
`@container` in exactly one place (`frontend/src/app/viewer/MarkdownReader.tsx:727-733`) and
the shell's responsiveness does not run through it.

### The state axis already has a canonical, accepted vocabulary

`.vault/adr/2026-06-25-state-mode-uniformity-adr.md` (status `accepted`) D1 fixes four
canonical modes used identically in Figma and code: `typical`, `loading`, `degraded`, and
`empty`. D2 makes loading UI-only with no text; D3 makes degraded and empty a shared glyph
plus one plain sentence; D4 names the shared kit primitives (`Skeleton`, `StateBlock`)
exported from `frontend/src/app/kit/`. D5 requires each data-bearing Figma component to
carry a `State=` variant axis.

D6 requires Figma and frontend to stay visually identical and flags the parity check as an
outstanding concern. No surface in the repository renders the four modes together for
review, so that verification has no home today. A harness organized on this vocabulary is
therefore not inventing an axis; it is supplying the missing verification surface for an
already-accepted decision.

One unreconciled drift sits underneath: `frontend/src/app/right/railStates.tsx:14` declares
`RailState` as `populated | empty | degraded | loading`, using `populated` where the ADR
says `typical`, and a second, separate `railStates` module exists at
`frontend/src/app/left/railStates.tsx`.

### Dev-domain code is currently entangled with production code

The preview concern has leaked across the production boundary in five distinct ways, which
together form the evidence for a separation decision.

A shipped production component carries a dev-only prop:
`frontend/src/app/right/StatusTab.tsx:765` accepts `stateOverride?: RailState`, consumed at
`:782` as `stateOverride ?? deriveRailState(...)`, existing solely so a harness can force a
state.

Dev-only code sits in the production stores layer:
`frontend/src/stores/view/threeLabVocabulary.ts` (8.5KB) is imported only by
`frontend/src/three-lab/`, `frontend/src/graph-visual/main.tsx`, and its own test - zero
production consumers.

Dev-only copy is compiled into the shipped localization catalog:
`frontend/src/localization/messagePolicy.ts:9` imports `THREE_LAB_MESSAGE_POLICY` from
`messagePolicy.threeLab.ts`, and `catalogKeys.test.ts` asserts over three-lab keys.

Five harnesses live under `src/` (`filters-visual`, `status-visual`, `viewer-visual`,
`graph-visual` at 660 lines combined, plus `three-lab` at 1607 lines) with six dev-only
HTML entries at the frontend root. `frontend/src/prototype/` is an empty directory.

And the harnesses disagree with each other on how to preview a state: `status-visual`
reads a `?state=` URL parameter and threads it into the production prop; `graph-visual`
reads its own `?state=` through a local resolver into `CanvasStateOverlay`; `viewer-visual`
has no state axis but swaps fixtures via `?fixture=messy` and hand-builds synthetic served
bytes; `filters-visual` has no state axis and drives local React state over inline fixture
data.

Mitigating the migration risk: no test, Playwright config, or build config references any
of the six dev HTML entries. The only references are untracked scratch scripts
(`frontend/tmp-*.mjs`, `frontend/.tmp/`) pointing at ports 5176 and 5188, which are
themselves stale and violate the project's explicit-port rule.

### Industry practice converges on the iframe-isolated mode matrix

The dominant contemporary pattern is Storybook rendering each story inside an isolated
preview iframe, with Chromatic "modes" crossing global settings into a matrix. Modes are
defined centrally in one file and applied at project, component, or story level, where they
stack rather than override; the documented guidance favors a few meaningful paired modes
("dark desktop", "light mobile") over an exhaustive cross-product, because every mode is a
separate snapshot carrying review and performance cost.

The independently interesting part is that the iframe is used for the same mechanical
reason it is forced here - a story's viewport is adjusted by sizing the iframe it renders
in - which corroborates that the constraint is intrinsic rather than specific to this
codebase.

Storybook 10 remains the framework-agnostic standard with the mature addon ecosystem;
Ladle is the leaner React-and-Vite-only alternative with materially faster cold start and
hot reload. Both are weighed against this project having already adopted and then removed
Storybook, and against the repository already containing the substrate a gallery needs: a
Vite 8 builder, a generated OKLCH token tier with three themes, a framework-free theme
controller, an established multi-HTML-entry dev harness convention, and a 29-primitive
component kit barrel at `frontend/src/app/kit/index.ts`.

Not investigated: visual-regression snapshot services, since the user scoped this to a live
render-and-review surface rather than a capture pipeline; and whether the removed stories
from `034088a1a3` are recoverable from history in a form worth restoring.

### What the ADR must settle

Four questions are left open by this evidence. First, the single canonical seam by which a
harness drives a data-bearing production surface into one of the four canonical modes
without an authored engine double. Second, whether that seam retires
`StatusTab.stateOverride` and what replaces it. Third, whether figma-design-bridge D3(a) is
amended or superseded, and what is named in place of the retired tool. Fourth, whether the
production/dev separation is part of the same decision or a distinct one, and what enforces
it - noting the repository's existing gate pattern of scanner scripts wired into
`just dev lint frontend`.

## Sources

- `.vault/adr/2026-06-15-figma-design-bridge-adr.md`
- `.vault/adr/2026-06-25-state-mode-uniformity-adr.md`
- `.vault/adr/2026-06-12-dashboard-gui-adr.md:419,762`
- `.vault/audit/2026-06-17-management-engine-optimization-audit.md`
- `.vault/plan/2026-06-15-figma-design-bridge-plan.md`
- `.vault/research/2026-06-15-figma-design-bridge-research.md:63,202`
- commit `034088a1a3`
- `frontend/src/stores/view/viewportClass.ts:29,38,66`
- `frontend/src/platform/theme/themeController.ts`
- `frontend/src/app/right/StatusTab.tsx:765,782`
- `frontend/src/app/right/railStates.tsx:14`
- `frontend/src/app/left/railStates.tsx`
- `frontend/src/stores/view/threeLabVocabulary.ts`
- `frontend/src/localization/messagePolicy.ts:9`
- `frontend/src/app/kit/index.ts`
- `frontend/src/testing/liveEngine.globalSetup.ts`
- `frontend/src/app/viewer/MarkdownReader.tsx:727`
- `frontend/vite.config.ts:37`
- https://www.chromatic.com/docs/modes/
- https://storybook.js.org/docs/essentials/viewport
- https://storybook.js.org/blog/storybook-10/
