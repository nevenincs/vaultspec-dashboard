---
tags:
  - '#audit'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
  - "[[2026-07-14-workspace-picker-dialog-adr]]"
---

# `workspace-picker-dialog` audit: `production folder picker review` | APPROVED

## Scope

Independent code review of the redesigned add-project workspace picker against
the ADR (D1-D7, including the 2026-07-15 D1 amendment to a static "Pick
folder" confirm) and the plan. Reviewed: the engine `/fs/list` enrichment
(`is_hidden`, `is_registered`, `places`, pre-cap `q`/`hidden`) and typed
`error_kind` refusals in `engine/crates/vaultspec-api/src/routes/fs_browse.rs`
and `registry.rs`; the stores seam (`graphTypes.ts`, `client.ts`,
`liveAdapters/listings.ts`, `queries/fsBrowse.ts`, `queries/workspaces.ts`,
`addProjectIssue.ts`); the chrome rebuild (`FolderBrowser.tsx`,
`PickerPlacesRail.tsx`, `AddProjectDialog.tsx`, `Dialog.tsx` size/dismissible);
the localization plumbing for the new keys; and every associated test.
Independently verified by the reviewer: engine unit tests, fmt, clippy
(`-D warnings`), tsc, eslint, prettier, the localization scanner, and the
picker test slice live against a real engine (75/75 on the final pass).
Parallel campaigns' in-flight files (TreeBrowser/VaultBrowser localization,
`authoring/approvals.rs`) were explicitly out of scope.

## Findings

### focus-zone-bypass | high | FolderBrowser hand-rolled a roving-tabindex composite instead of the shared FocusZone primitive

The rebuilt listbox implemented its own `activeIndex`/`focusRow`/keydown
machinery - the exact bespoke roving loop the actions-keymap rule forbids, and
a sixth instance of the pattern the shared `useFocusZone` primitive was built
to retire. RESOLVED: the listbox now roves through `useFocusZone` (vertical
zone; ArrowRight/ArrowLeft bound to cross-axis navigate-in/climb; Enter and
Backspace composed on the row handler with consume-then-stop; selection follows
the rove). Confirmed fixed on re-check.

### breadcrumb-focus-loss | high | Breadcrumb and places-rail navigation dropped keyboard focus, contradicting ADR D2

Only in-list gestures preserved focus across a level change; activating an
ancestor breadcrumb (which re-renders as the non-interactive current-location
span) or a places-rail row dropped focus to the document body. RESOLVED: the
dialog's single `navigate()` funnel arms a shared focus intent consumed by the
browser's level-change effect, which re-seeds the rove and focuses the new
level's first row; guarded to fire only on a real level change (an interim
per-render rove-reset bug was caught by the new tests and fixed). A dedicated
interaction suite now covers one-tab-stop roving, Enter/breadcrumb/external
navigation focus retention, and the ArrowLeft climb. Confirmed fixed on
re-check.

### typed-path-retreat | none | The typed-path ancestor retreat is bounded

Explicitly audited: the error-driven retreat strictly shortens the path one
segment per step and terminates at every platform root (unix, drive, UNC) -
`O(depth)`, no loop. Covered by live-wire and pure-resolver tests.

### unix-root-breadcrumb | low | Browsing the literal unix root shows only the roots crumb

Functionally correct but visually ambiguous about depth on non-Windows
platforms. Non-blocking; accepted as a follow-on nicety.

### suite-load-flake | none | One order-sensitive dialog test attributed to the documented shared-engine flake class

The rejected-registration test passes in isolation and in scoped batches but
intermittently timed out under the full suite. The reviewer ruled out
misclassification (no stray `.git` on the tmpdir ancestor chain) and query-cache
bleed, and attributed it to the documented GS-007/TIH-002 class: one shared
mutable engine process under full-suite load can queue a real `PUT /session`
round trip past the generic wait budget. Infrastructure, not a picker defect;
any fix belongs in test-harness discipline (an engine-quiescence barrier before
the mutation).

### already-registered-unreachable | none | The `already_registered` refusal kind is declared but never emitted

The frozen registry contract makes re-registration an idempotent upsert
(conformance-tested), so the engine cannot refuse with it; the picker's
`is_registered` markers prevent the attempt, and the client still maps the kind
defensively. Recorded as an honest, documented deviation from a literal reading
of ADR D6.

## Recommendations

- Landed before approval (required): the FocusZone refactor and the
  navigation focus-intent mechanism, with the interaction test suite.
- Follow-on (low, optional): a distinct current-location affordance when
  browsing the literal unix root.
- Follow-on (infrastructure): if the load flake recurs, add an
  engine-quiescence barrier before the dialog test's real registration
  mutation rather than widening waits.
- Shared-tree note at approval time: the frontend lint recipe's module-size
  component is breached only by another campaign's uncommitted
  `authoring/approvals.rs`; every component this feature can influence exits 0.
