---
tags:
  - '#audit'
  - '#ambient-scope-coherence'
date: '2026-07-13'
modified: '2026-07-13'
related:
  - '[[2026-07-13-declared-edge-continuity-adr]]'
  - '[[2026-07-13-graph-slice-delta-adr]]'
---

# `ambient-scope-coherence` audit: `ambient active-scope vs persisted client state`

## Scope

Grep-complete sweep of every persisted or durable frontend-adjacent state (engine session fields, backend dashboard-state, every zustand persist store, direct localStorage use) crossed against every consumer that interprets such state through the ambient active scope (`useActiveScope`). Prompted by a live incident: the engine session's `active_scope` — a shared, mutable, backend-persisted global any client can flip — was switched by another client; persisted open tabs (which carry no scope) were re-read against the flipped scope, the engine honestly 404'd, and the reader rendered the miss as a blank body ("every document reports empty"). The audit enumerates the full class, the scope-switch arrival paths, and the attribution law to codify.

## Findings

### remote-flip-reset-gap | high | a remote active-scope change fires no reset or re-attribution

The wholesale corpus-local reset (`applyAcceptedActiveScopeSwitch`) runs only on a USER-initiated switch. A background session refetch that returns a different `active_scope` (another client's flip) silently moves `useActiveScope()` on a passive client (one that never picked a scope in-session), while one-shot seeding (`seedFromSession`) leaves tabs/folder/features interpreted through the new ambient scope. This is the incident's true arrival path. Silent.

### restored-tabs-scope-less | high | v1 workspace-layout tabs rebuild without scope and reproduce the incident

The layout blob is stored per-scope in session `scope_context`, but its tab ENTRIES carry no scope; `parseWorkspaceTabs` rebuilds restored tabs scope-less, so they read via the ambient scope. Even with per-tab binding for newly-opened tabs, every RESTORED tab reproduces the blank-reader failure until the v2 blob persists per-tab scope and the restore path binds v1 tabs to their scope_context's own scope (their provable origin). Silent → blank reader.

### editor-save-third-scope | medium-high | the keyboard save writes against a third scope source

The in-panel save threads the tab scope, but global Mod+S saves against the view store's picked scope (`editorKeybindings` reading `state.scope`, null on cold boot) — a third source distinct from both the tab scope and the panel prop. A cross-scope tab plus Mod+S can save a document stem against the wrong corpus: conflict/404 at best, a same-named document overwritten in the wrong corpus at worst. Fix: the editor target carries the tab's scope; both save paths route through it.

### scope-context-one-shot-seed | medium | folder/feature context seeds once and never re-attributes

`useScopeContextSelection` seeds `activeFolder`/feature contexts one-shot from the cold-boot scope and is never re-seeded for a scope observed later; on a remote flip the seeded values are interpreted under the new ambient scope. Stale-but-inert today, incoherent by construction.

### dashboard-state-per-scope | low | backend dashboard/graph state is safe by re-key

Selection, filters, date range, timeline mode, graph query id/bounds, and panel state fold the scope into every query key; an ambient flip re-keys to the target scope's own coherent state. A fresh client booting into a foreign workspace's graph is the shared GLOBAL choosing which scope — the render itself is valid, never blank. No per-state change needed.

### scoped-storage-reference-pattern | low | pins, lenses, and the position cache are the model

`createScopedStore`/`positionCache` fold workspace+scope into the storage KEY and re-key on swap (guarded by an adversarial isolation test). This is the in-repo reference mechanism for the attribution law.

### inert-presentational-persist | low | rail fold/expansion stores are scope-free by inertness

Tree expansion and status-fold chrome persist presentational booleans keyed by folder names or commit hashes; a scope mismatch simply matches no rendered row. No wire reads, no crash. Acceptable as scope-free-by-inertness.

## Recommendations

- Codify the attribution law: any client state carrying scope-bearing identifiers (node ids, document stems, file paths, folders, feature tags) is attributed with its ORIGIN scope and read against that scope — never the ambient active scope. Prefer attribution over reset: a foreign flip must not destroy a passive client's restored context.
- Fold the two HIGH and the MED-HIGH findings into the in-flight per-tab scope-binding build (restored-tab binding via the v2 blob + v1 origin-scope inference; editor target scope unifying both save paths; scope-context re-seed on observed remote flip while unpicked). Done as of this audit's filing — routed as required scope.
- Any scoped read that misses against held UI state renders a designed error state, never a blank body (in the same build).
- The remote-flip seam beyond tabs (finding 1): once tabs, editor target, and scope context are attributed, the residual effect of a foreign flip is the per-scope-keyed rails/graph honestly following the global; a visible plain-language notice on an observed remote flip is the remaining courtesy, deferred as a follow-on.
- Generalize from the scoped-storage-key pattern for any future persisted state; the isolation adversarial test is the guard idiom to replicate.
