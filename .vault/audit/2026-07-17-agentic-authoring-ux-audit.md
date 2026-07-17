---
tags:
  - '#audit'
  - '#agentic-authoring-ux'
date: '2026-07-17'
modified: '2026-07-17'
related:
  - "[[2026-07-14-a2a-orchestration-edge-adr]]"
  - "[[2026-07-16-agentic-authoring-ux-plan]]"
---

# `agentic-authoring-ux` audit: `team-selector wiring`

## Scope

W05.P05 deferred plan steps S21/S22 — wiring the Composer's Team pill onto the
already-shipped a2a team store layer (`a2aTeam.ts`, `liveAdapters/a2aRelay.ts`). Reviewed
the net diff across three commits — `dfed1ae3c0` (feat), `7be18f12a4` (CRLF
normalization), `c608584cac` (revision fixes) — scoped to six files:
`app/agent/Composer.tsx`, `app/agent/Composer.render.test.tsx`,
`locales/en/common.ts`, `localization/messagePolicy.agent.ts`,
`localization/catalogKeys.test.ts`, `localization/testing/agentResources.ts`. The
consumed store layer (`stores/server/agent/a2aTeam.ts`,
`stores/server/liveAdapters/a2aRelay.ts`) was read for contract context only — it is
shipped, tested, and out of scope for changes.

Evaluated against wire-contract (disabled-with-reason gating, honest non-loadable
presets, served-phase-verbatim, relay-adapter terminal-ness), architecture-boundaries
(dumb chrome, sole a2a client path), frontend-store-selectors, actions-keymap-palette
(Class-B intrinsic keys), state-lifecycle correctness (run id lifecycle, button
precedence, Enter routing, wedge/race hunting), localization parity, and test
integrity (live-wire, non-tautological).

## Findings

### menu-dismiss-reopen | high | trigger click dismiss-then-reopened the open menu — FIXED

The `DropdownButton` trigger was a sibling of the `Popover`, not a descendant, and the
`Popover` carried no `ignoreSelector`. `useDismissOnOutsidePointer` fires on
`pointerdown`, which precedes `click`: clicking the trigger while the menu was open
first dismissed it via the outside-pointer listener, then the trigger's own `onClick`
toggle read the freshly-`false` state and flipped it back to `true` — a mouse user
could not close the menu with a single click on the trigger (keyboard Enter/Space was
unaffected, since it dispatches no `pointerdown`). This is the exact footgun the
`ignoreSelector` prop documents, already guarded against at three sibling call sites
(`PropertiesPopover.tsx`, `FilterSidebar.tsx`, `WorktreePicker.tsx`).

Resolved in `c608584cac`: the trigger span carries `data-composer-team-trigger` and the
`Popover` passes `ignoreSelector="[data-composer-team-trigger]"`, matching the shipped
pattern. Verified by re-reading the diff — no regression.

### escape-dismiss-blocked | high | row keydown stopPropagation ate the Popover's own Escape dismiss — FIXED

Both menu row buttons (`Single agent` and each team preset) carried
`onKeyDown={(event) => event.stopPropagation()}` unconditionally on every key. The
`Popover`'s `useDismissOnEscape` listens on `window` by default; calling
`stopPropagation()` on a row keydown prevented the event from ever reaching that
listener, so pressing Escape with keyboard focus on a row did not close the menu. The
handler bought no compensating protection: the Composer's own keydown routing is wired
only on the `<textarea>`, a separate subtree the menu rows were never going to bubble
into. The sibling session menu in `AgentPanel.tsx` (same file family, same
trigger+`Popover`+row-button shape) carries no such handler on its rows.

Resolved in `c608584cac`: both `onKeyDown` props were deleted. Verified — Escape now
reaches the Popover's dismiss listener from a focused row as expected.

### preset-reselect-race | medium | preset could be reselected between "Start team" and the run id landing — FIXED

The Team selector's `locked` gate (`activeRun !== null || teamRunActive`) did not
include `startTeamRun.isPending`. Between clicking "Start team" and the mutation
resolving with a `run_id` (`teamRunId` set only on success), the selector stayed
unlocked, so a user could reselect a different preset while the start request was in
flight. Once the response landed, `teamRunActive` flipped true and the selector froze
on whatever preset was then selected — not necessarily the one the mutation actually
started with (the payload closed over `selectedTeamPreset` at click time) — desyncing
the displayed pill from the run actually running.

Resolved in `c608584cac`: `locked` now also folds in `startTeamRun.isPending`, freezing
the selection from click through landed run id.

## Recommendations

- None outstanding. All three findings from the initial review pass were addressed in
  the revision commit and re-verified against the full three-commit net diff; no new
  regressions were introduced (localization parity, store-selector discipline,
  architecture boundaries, and wire-honesty were re-confirmed unchanged and clean).
- Carry the `ignoreSelector` convention (external-trigger + sibling `Popover`) forward
  as the default whenever a new dropdown-style menu is authored — `AgentPanel.tsx`'s
  session menu has the same latent dismiss-then-reopen gap and would benefit from the
  same fix in a future pass, though it is out of scope here.
