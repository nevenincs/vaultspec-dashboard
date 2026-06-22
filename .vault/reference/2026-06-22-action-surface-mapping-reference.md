---
tags:
  - '#reference'
  - '#action-surface-mapping'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - "[[2026-06-22-action-surface-mapping-adr]]"
  - "[[2026-06-22-action-surface-mapping-audit]]"
---



# `action-surface-mapping` reference: `action coverage grid`

The single source of truth for action-verb enrollment across the three planes — the
keymap registry (K), the per-kind context-menu resolver registry (M), and the Cmd+K
command palette (P). It records, per surface domain, which verbs are enrolled on each
eligible plane today and which are eligible-but-missing (the delta this campaign
closes). Grounded by the `2026-06-22-action-surface-mapping-audit` plus direct source
verification.

## Summary

### Per-plane eligibility rule

A verb is enrolled only on the planes it is ELIGIBLE for; it is never forced onto
another:

- **K (keymap)** — a verb that warrants a command chord. Excludes input-requiring verbs
  (no chord can supply a name) and purely target-relative verbs with no global meaning.
- **M (resolver)** — a target-relative verb on a right-clickable entity kind.
- **P (palette)** — a GLOBAL, no-target verb. Excludes target-relative verbs (they need
  a selection/entity) and input-requiring verbs.

`—` in the grid means "not eligible for this plane" (with the reason); `MISS` means
"eligible but not yet enrolled" (the delta); `OK` means enrolled.

### Coverage grid (K = keymap, M = context-menu, P = palette)

**Global chrome**
- command-palette toggle: K OK (`app:command-palette`) · M — (chrome) · P — (self)
- search / document-search: K OK (`app:search`, `app:document-search`) · M — · P OK (modes)
- window layout (rails/timeline/tabs/reset): K — (no chord set) · M — · P OK (`window:*`)
- settings open: K — · M — · P OK (`app:settings`)
- theme: K — · M — · P OK (`settings:theme-*`)
- help legend: K OK (`app:keyboard-shortcuts`) · M — · P OK (`window:keyboard-shortcuts`, help family)

**Left rail**
- new-document: K OK · M OK (vault-doc) · P OK (`left-rail:new-document`)
- browse-mode / cycle: K OK (`left-rail:cycle-browser-mode`) · M — · P OK (`browse-*`)
- toggle-facets: K OK · M — · P OK
- collapse-tree: K OK · M — · P OK · expand-tree: K OK · M — · P — (needs live tree keys)
- reset-filters: K OK · M — · P OK
- **focus-filter: K OK (`left-rail:focus-filter`) · M — · P MISS** ← delta (P20)
- **clear-filter: K OK (`left-rail:clear-filter`) · M — · P MISS** ← delta (P20)
- vault-doc / code-file / workspace / worktree rows: M OK (resolvers) · K — · P — (target-relative)

**Graph stage**
- camera (fit/zoom/freeze/reset): K — (canvas walk only) · M — · P OK (`graph:*`)
- walk / open / expand-ego (canvas): K OK (`graph:walk-*`, canvas context) · M — · P — (scene-only)
- node / edge / meta-edge / island / canvas: M OK (resolvers) · target-relative
- relate / archive (node): M OK (shared builders) · K — · P — (selection-relative)

**Timeline**
- playhead jump / fit / range presets: K OK (nav cycle) · M — · P OK (`timeline:*`)
- event mark: M OK (eventMarkMenu) · target-relative

**Right rail**
- activity tabs (properties/diff/search/status): K OK (`right-rail:show-*`) · M — · P OK (via window provider `window:rail-*`)
- focus-search: K OK (`right-rail:focus-search`) · M — · P MISS (low value)
- change / search-result / edge: M OK (resolvers, compose open/reveal/open-in-editor) · P — (target-relative)
- **commit / pull-request (StatusTab): K MISS · M MISS · P MISS** ← delta (P21); verify capability first

**Document editor**
- save-body: K OK (`editor:save-body`, Mod+S) · P OK (editor provider) · M — (no row)
- close: K OK · P OK · toggle-mode: K OK (`editor:toggle-mode`, Mod+E) · P OK
- rename: editor-surface affordance only (input-requiring) — K — · M — · P — (correct)
- **autofix: K MISS · M — · P MISS** ← delta (P22); verify capability first
- **frontmatter-edit: editor-surface — verify if a discrete verb exists** ← delta (P22)

### The delta this campaign closes

1. `focus-filter` / `clear-filter` → add to the palette (P) under their existing keymap
   ids. `focusLeftRailFilter()` is a pure module fn in `leftRailKeybindings.ts`;
   `clearFeatureFilter` is `useDashboardFeatureFilterDraft(scope).clear` (hook-bound, must
   ride `CommandContext`).
2. Right-rail commit / pull-request verbs → confirm capability (`StatusTab`), then enroll
   on the eligible plane(s) and add a `rightRailCommandProvider` (resolving the
   window-provider tab asymmetry).
3. Editor `autofix` / `frontmatter` → confirm capability; enroll or record non-capability.
4. A coverage-grid guard test asserting K/M/P enrollment + cross-plane id identity.

### Cross-plane id namespace (load-bearing)

Each verb keeps ONE action id across K/M/P (e.g. `left-rail:focus-filter` is the keymap
`KeybindingDef` id AND the palette command id), so `deriveCommandAccelerators`
(`commandPaletteCommands.ts`) resolves the inline accelerator and the `?` legend cannot
drift. The guard test asserts this identity.
