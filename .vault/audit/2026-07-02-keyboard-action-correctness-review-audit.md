---
tags:
  - '#audit'
  - '#keyboard-action-correctness-review'
date: '2026-07-02'
modified: '2026-07-12'
related: []
---

# `keyboard-action-correctness-review` audit: `keyboard navigation and action correctness review`

## Scope

User-directed reliability review of the unified action plane and the keyboard
navigation system, prompted by the report "actions don't work reliably — copy
actions e.g.". Three questions: (1) root-cause the copy-action failure
specifically, tracing every copy verb from its `ActionDescriptor` through to the
actual clipboard write; (2) audit general action reliability across the four
planes (context-menu resolver registry, keymap registry + dispatcher, command
palette, appDispatcher dispatch seam) — consistency, gating honesty, failure
handling; (3) verify the two-tier keyboard-navigation model end-to-end (F6
region cycling, FocusZone roving, the single global keymap dispatcher,
double-fire isolation, dead zones). Read-only; findings carry KAR-### ids.

Surfaces read: `frontend/src/platform/actions/clipboardActions.ts` (the copy
verb + terminal handler), `platform/actions/action.ts` (descriptor +
`fireActionDescriptor`), `platform/dispatch/{dispatch,middleware,useAction}.ts`
(the seam), `app/menu/ContextMenuHost.tsx` (the menu plane's activation),
`app/menus/sharedActions.ts` (relate/archive/autofix), `app/stage/menus/graphNodeMenu.ts`
(representative resolver), `stores/server/opsActions.ts` + `stores/server/engine.ts`
(ops terminal effect + wire semantics), `app/palette/CommandPalette.tsx`
(arm-to-confirm), `stores/view/keymapDispatcher.ts` +
`platform/keymap/registry.ts` (chord resolution), `app/chrome/useFocusZone.ts`,
`app/chrome/regionCycleKeybindings.ts`, `app/viewer/scrollRegion.ts`,
`app/AppShell.tsx`, `app/stage/graphWalkKeybindings.ts`, `frontend/vite.config.ts`
(serving origin), `app/viewer/{CodeViewer,MarkdownReader}.tsx` (bespoke copy
buttons).

## Findings

### copy-verb-architecture-sound | info | one copy verb, one terminal handler, composed by every menu

The copy family is architecturally converged, exactly as the action-plane rules
require: one `copyAction` builder plus one `COPY_ACTION` terminal handler
registered on the appDispatcher seam (`platform/actions/clipboardActions.ts`),
composed by fourteen per-kind menu resolvers (graph node, meta-edge, island,
vault doc/feature/category, code file, workspace, worktree, commit, change, PR,
search result, edge). Payloads ride a sanctioned `CopyWhat` whitelist
(id/title/path/stem/summary). No drift in the verb's authoring; the defects
below are all in the terminal write and the result handling, not the plane.

### KAR-002 | high | ROOT CAUSE: clipboard writes require a secure context; the canonical origins are plain HTTP over the network — copy is a permanent silent no-op there

`writeClipboard` (`clipboardActions.ts:69-79`) has exactly one write path:
`globalThis.navigator?.clipboard?.writeText`. The Async Clipboard API exists
ONLY in secure contexts (https, `localhost`, `127.0.0.1`). The project's
canonical serving origins are neither: the dev SPA is deliberately
network-exposed over plain HTTP (`vite.config.ts` `host: true`, "accessible
from other machines on the same Tailscale network"; the codified canonical
origin is `http://gw-workstation:8770`), and the engine-served production SPA
(`vaultspec serve` on 8767, `routes/spa.rs`) is likewise plain HTTP. On any
non-localhost hostname `navigator.clipboard` is `undefined`, so the optional
chain at `clipboardActions.ts:71` short-circuits: `writeClipboard` returns
`false` WITHOUT throwing — even the `clipboardLog.warn` never fires, because
the guard fails before any rejection exists. Every copy action on every menu
is therefore a permanent, perfectly silent no-op whenever the dashboard is
opened via the network hostname, and works when opened via localhost. That
split is precisely the reported "copy actions don't work reliably": the same
click works or does nothing depending on which origin the tab happens to use,
with zero feedback either way.

### KAR-003 | high | the advertised execCommand fallback does not exist

The doc comment on `writeClipboard` (`clipboardActions.ts:68`) reads "Write
text to the clipboard, with an execCommand fallback for older surfaces" — but
the function contains no fallback of any kind; `execCommand` appears nowhere in
`frontend/src` outside that comment. The one mechanism that WOULD cure KAR-002
(a hidden-textarea `document.execCommand("copy")` path, which still functions
in non-secure contexts in current Chromium/Firefox precisely because it
predates the secure-context requirement) is claimed and absent. Same lesson as
TTR-008: comments are claims, not evidence.

### KAR-004 | medium | copy has zero user feedback in every plane — success and failure are indistinguishable

The copy handler dutifully resolves `{ok: boolean}` (`clipboardActions.ts:82-85`),
and nobody reads it: `ContextMenuHost.activate` fires
`dispatch(activation.dispatch)` and discards the promise
(`ContextMenuHost.tsx:143`), then closes the menu. There is no toast, no
live-region announcement, no armed "Copied" flash — on success OR failure. The
menu already renders a polite `aria-live` region (`ContextMenuHost.tsx:294`),
so the surface for feedback exists and is unused. Even in a secure context a
transient `NotAllowedError` (document not focused — e.g. devtools focus) is
invisible. KAR-002 made copy fail; KAR-004 made the failure undiagnosable.

### KAR-005 | medium | bespoke clipboard writes bypass the copy verb (CodeViewer, MarkdownReader)

`CodeViewer.tsx:153` and `MarkdownReader.tsx:101` implement their Copy buttons
as raw `void navigator.clipboard?.writeText(text).catch(() => undefined)` —
outside the copy verb entirely. They share the KAR-002 silent no-op (the
optional chain short-circuits on non-secure origins), swallow every rejection,
have no fallback and no feedback, and are exactly the "bespoke per-surface
button handler that bypasses the plane" the unified-action-plane rule names a
defect. A `writeClipboard` fix would NOT reach them; they must be routed
through `dispatchCopy` so the cure lands once. (The `three-lab` dev harness has
the same shape at `ThreeLab.tsx:188/215`; dev-only, noted not counted.)

### KAR-006 | high | menu-fired ops verbs discard their outcome: refusals look like success, rejections are unhandled, success does not invalidate

The context menu is the ONLY plane offering the mutating vault verbs (relate /
autofix / archive are feature-scoped, correctly kept off the palette), and it
is the one plane with no result handling. `sharedActions.ts` builds them as
`dispatch: {type: OPS_ACTION, ...}`; `ContextMenuHost.activate` discards the
returned promise (`ContextMenuHost.tsx:143`). Three distinct consequences:
(a) business refusals are invisible — the engine deliberately returns HTTP 200
for BOTH success and refusal, with the outcome in the forwarded core envelope
("the caller interprets the outcome... branching on the envelope status + data,
never the HTTP code", `engine.ts:2036-2068`); the menu never branches, so a
refused relate (dangling target) or archive (unknown tag) closes the menu and
looks identical to success. (b) transport failures become unhandled promise
rejections — nothing catches them, and per KAR-007 the seam's own logging
cannot see them. (c) success triggers no cache invalidation — the ops terminal
handler explicitly assigns invalidation to the caller (`opsActions.ts:322-326`),
and the menu is a caller that never invalidates; the UI updates only when the
engine's file watcher (2000ms debounce) rebuilds and the SSE delta lands.
Net effect: a user right-clicks "Relate to focused node", the menu closes, and
for seconds — or forever, on a refusal — nothing observable happens. Combined
with the copy silence this IS the reported "actions don't work reliably".
Contrast: the palette's ops commands surface an inline ops message
(`useCommandPaletteOpsMessage`), so the feedback machinery exists one plane over.

### KAR-007 | medium | the dispatch seam's logging is sync-only; async handler failures are structurally invisible

`loggingMiddleware` wraps `next(action)` in try/catch
(`middleware.ts:19-27`) — it can only observe synchronous throws. Every
consequential handler is async (ops → engine fetch, copy → clipboard promise),
so a rejected handler promise flows out through the middleware chain
uncaught-by-design, and the firing surfaces discard it
(`fireActionDescriptor` returns the value nobody awaits, `action.ts:213-220`;
`fireKeyAction` ignores it, `keymapDispatcher.ts:110-112`; menu activate
ignores it). The seam's charter — "the single place a user intent can be
logged, traced, guarded" (`dispatch.ts:2-7`) — holds only for the sync half.
Any async action failure from any plane is an unhandled rejection with no seam
log and no user surface.

### KAR-008 | medium | no guard asserts the assembled default-chord set is conflict-free; same-specificity collisions shadow silently and alphabetically

`resolveKeybinding` tie-breaks same-specificity chord collisions by id order
(`registry.ts:248-252`) — deterministic, but silent: if two GLOBAL bindings
ever land on one chord, the alphabetically-later action simply never fires,
with no warning anywhere. `findConflicts` exists but is consumed only by the
settings recorder for user overrides (`registry.ts:267-271`); no test
assembles the ~12 distributed registration hooks' defs (left/right rail,
project, editor, doc-tab, reload, graph-toggle, region-cycle, graph-walk,
keyboard-nav, palette toggles) and asserts the DEFAULT set is collision-free.
Note a correct guard must compare same-specificity pairs only — the canvas
arrow bindings deliberately shadow the global arrow-walk by context
specificity, which `contextsOverlap` counts as a conflict.

### keyboard-navigation-sound | info | the two-tier model is converged and the historical failure classes are closed

Verified end-to-end, no dead zones or double-fires found. Exactly one window
keydown listener (`useKeymapDispatcher`, mounted via `KeyboardNav` in BOTH
shell branches — `AppShell.tsx:176` compact and `:210` desktop). F6/Shift+F6
region cycling is a registry binding, not a private listener
(`regionCycleKeybindings.ts`), with a focusin tracker feeding per-region entry
memory; initial focus lands on the stage and the skip link is the first tab
stop (`AppShell.tsx:156-158, 192-201`). Class-B isolation holds everywhere
inspected: `useFocusZone` stops consumed keys (`useFocusZone.ts:227-230`), the
context menu stops its arrows/Enter/Escape (`ContextMenuHost.tsx:161`), and
read-only scroll regions stop scroll keys WITHOUT preventDefault so native
scrolling survives while the global arrow-walk never fires
(`scrollRegion.ts`, wired at `MarkdownReader.tsx:409` and `CodeViewer.tsx:91`).
The text-entry gate is correct and deliberate about named keys
(`keymapDispatcher.ts:153-164`). The canvas arrow bindings shadow the global
arrow-walk by most-specific-context-wins (`graphWalkKeybindings.ts` +
`data-keymap-context` at `Stage.tsx:412`), the earlier double-fire class'
canonical fix. Malformed persisted chord overrides are ignored rather than
disabling a binding (`registry.ts:199-216`).

### palette-arm-to-confirm-sound | info | the type-keyed confirm guard cannot leak or cross-fire

The process-wide `appConfirmGuard` arms by action TYPE ("ops:run"), which
looked like a cross-command hazard; it is defensively closed. The palette is
the guard's only consumer (`useConfirmable` grep: palette only); every exit
path disarms (close/reset/backdrop/Escape funnel through one `disarm`,
`CommandPalette.tsx:105-126`), cursor movement disarms (`:189-192`), arming a
different command cancels the prior arm first (`:164-169`), and source-driven
command-list changes run an armed-repair effect (`:146-153`). The context menu
never sets `meta.guard` — it owns its own `armedItemId` two-step with its own
disarm-on-projection-change repair (`contextMenu.ts:445-482`), so the two arm
systems cannot interact. Time-travel gating is honest and currently inert by
construction: persisted time-travel modes heal to live on load (the TTR-005
disposition), and both the resolver registry and the keymap dispatcher apply
the same central `disabledInTimeTravel` gate.

## Recommendations

Triage order matches user impact.

1. **Fix `writeClipboard` (cures KAR-002/003 at the root).** Implement the
   fallback the comment already promises: when `navigator.clipboard` is absent
   OR `writeText` rejects, write via a hidden off-screen textarea +
   `document.execCommand("copy")` inside the still-live user-gesture call
   stack, and return its boolean. This restores copy on the plain-HTTP network
   origins with no serving-stack change. (Alternative/longer-term: serve over
   https on the Tailscale origin — heavier, and the fallback is still wanted
   for resilience.)
2. **Surface the copy outcome (KAR-004).** `ContextMenuHost.activate` should
   consume the copy dispatch's `{ok}` and announce "Copied" / "Copy failed" —
   the menu's existing polite live region or a small transient toast. Fail
   loudly enough to be diagnosable.
3. **Route the bespoke viewer copy buttons through `dispatchCopy` (KAR-005)**
   so the fallback + feedback land once; delete the raw
   `navigator.clipboard?.writeText` calls in `CodeViewer` / `MarkdownReader`.
4. **Make the menu consume ops outcomes (KAR-006).** On a menu-fired
   `OPS_ACTION`: await the envelope, branch success/refusal (the
   `adaptOpsWrite` pattern the editor already uses), surface the refusal
   reason, `.catch` transport failures into a visible degraded message, and
   perform the targeted query invalidation the ops handler contract assigns to
   the caller (or deliberately document SSE-only refresh and add an optimistic
   pending affordance so success is not indistinguishable from a no-op for
   ~2s).
5. **Promise-aware seam logging (KAR-007).** In `loggingMiddleware`, when
   `next(action)` returns a thenable, attach a `.catch` that logs through
   `dispatchLog.error` and rethrows (preserving caller semantics), so async
   action failures are at least observable at the one seam.
6. **Add a default-chord conflict guard test (KAR-008).** Assemble every
   registration hook's `KeybindingDef`s and assert no two SAME-specificity
   bindings share a canonical effective chord; whitelist the deliberate
   global-vs-canvas arrow shadowing.
