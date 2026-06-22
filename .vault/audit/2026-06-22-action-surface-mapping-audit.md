---
tags:
  - '#audit'
  - '#action-surface-mapping'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - "[[2026-06-22-action-surface-mapping-plan]]"
  - "[[2026-06-21-command-palette-actions-adr]]"
  - "[[2026-06-19-keyboard-action-system-adr]]"
  - "[[2026-06-15-dashboard-context-menus-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace action-surface-mapping with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `action-surface-mapping` audit: `frontend action-surface convergence audit`

## Scope

A rag-driven implementation audit of the five interlocking frontend systems — keyboard
shortcuts, the action system, the Cmd+K command palette, context menus, and keyboard
navigation — assessing whether they are genuinely cross-referenced and enrolled into the
central schemas and the TanStack common global state. Driven by `vaultspec-rag` semantic
search across the fragmented domains plus direct source verification. Conducted at the
close of the `command-palette-architecture` campaign and against the in-flight
`keyboard-navigation` (~30%), `keyboard-action-system` (~97%), and the bare 117-step
`action-surface-mapping` plan (0%). Three parallel rag audits (shortcuts+nav, actions+menus,
central-schema+state) were run and their PASS-leaning claims independently spot-verified.

## Findings

### The architecture is cohesive — convergence is largely already achieved (PASS)

The headline result: the systems are NOT fragmented. They converge on one shared verb unit
and three sibling registries that cross-reference by a shared id namespace.

- **One verb unit.** The shared `ActionDescriptor` (`platform/actions/action.ts`) is consumed
  unchanged by all three planes — the context-menu resolver registry
  (`platform/actions/registry.ts`), the command-provider registry
  (`stores/view/commandRegistry.ts`, whose `CommandDescriptor` extends
  `ActionDescriptorBase`), and the keymap dispatcher (`stores/view/keymapDispatcher.ts`). No
  plane defines a parallel action/command shape. Verified.
- **One global key listener.** Exactly one `window` keydown listener exists, in
  `keymapDispatcher.ts`; every Class-A command shortcut flows through the keymap registry +
  dispatcher. No private global command listener survives. The only other key handlers are
  Class-B widget-intrinsic (FocusZone roving, dismiss-on-escape, the keybinding recorder)
  that `stopPropagation` and never reach the dispatcher — the correct ARIA split.
- **One resolver per entity kind.** All twelve entity kinds (`workspace`, `worktree`,
  `vault-doc`, `code-file`, `node`, `edge`, `event`, `search-result`, `change`, `meta-edge`,
  `island`, `canvas`) have exactly one resolver, self-registered and collected once in
  `app/menus/registerAll.ts`. Every `onContextMenu` handler routes through `openContextMenu`
  to the one menu host; no hand-rolled menu was found.
- **Cross-surface verbs authored once.** `relate`, `archive`, and the standardized `open`
  (`openEntityAction`) live once in `app/menus/sharedActions.ts`; `copy` / `reveal` /
  `open-in-editor` live once in `platform/actions/`. Resolvers and providers compose them; no
  duplicate inline authoring.
- **One shortcut persistence + derived legend.** The engine `keybindings` setting
  (`settings_schema.rs`, sparse `{id: chord}`, bounded at 256) is the sole shortcut
  persistence, read through one binding (`useKeymapOverridesBinding` → the dispatcher's
  single `setKeymapOverridesReader`). The `?` legend, the dispatcher, and the palette's inline
  accelerators all derive the effective chord from the SAME registry + override reader by
  shared id, so they cannot drift.
- **One backend-state authority, no split-brain.** Shared dashboard intent (selection,
  filters, date-range, panel/tab, graph-query identity, the override map) flows through the
  TanStack-backed stores (`stores/server/dashboardState.ts`, `queries.ts`); view-local zustand
  holds only transient chrome and is wholesale-reset on scope swap. No surface keeps a
  duplicate copy of a shared concern; queries carry explicit `gcTime` (bounded-by-default).

### MED — Coverage has genuine residual gaps; the 117-step plan targets real un-enrolled verbs

Cohesive architecture does not mean complete coverage. Verified gaps where a verb exists but
is NOT enrolled in the plane it belongs on:

- **`focus-filter` / `clear-filter`** are keymap-only (`leftRailKeybindings.ts`); they are NOT
  contributed by any command provider, so they are unreachable from Cmd+K. (Low-value as
  palette commands, but the asymmetry is real.)
- **Right-rail commit / pull-request verbs** (`StatusTab`) appear in no plane — not keymap, not
  a command provider, and no `commit`/`pr` resolver. Genuine gap.
- **Editor `frontmatter` / `autofix` / `rename`** verbs are not palette- or keymap-enrolled
  (`save`/`close`/`toggle-mode` are). `rename` correctly lives at the editor surface (needs a
  name input); `autofix`/`frontmatter` are genuine candidates.
- **No `rightRailCommandProvider`.** Right-rail tab switching IS palette-reachable, but via the
  `windowCommandProvider` ("activity rail: <tab>") rather than a dedicated right-rail provider —
  a deliberate-but-inconsistent asymmetry vs every other surface having its own provider. (One
  audit agent fabricated a `rightRailCommandProvider.ts`; it does not exist — verified.)

### MED — The `action-surface-mapping` plan is over-scoped relative to actual coverage

The 117-step plan systematically enrolls every element's verbs onto the keymap (W01), the
resolver registry (W02), and the palette (W03) across six domains. Given the audit shows
coverage is already substantially complete, a blanket 117-step re-enrollment would re-author
work that exists and would force verbs onto planes where they do not belong (e.g. enrolling
chrome/region verbs as context-menu entries, or input-requiring verbs like `rename` as bare
chords). The plan is also a bare plan — no ADR or research grounds it; it relates to four
prior ADRs but records no decision of its own.

### LOW — keyboard-navigation spine is mid-flight (~30%); region enrollment incomplete

The focus spine (FocusZone, F6 region cycle as a Class-A binding, skip link, entry memory) is
architecturally sound and partially landed, but per-surface region enrollment is only ~30%
complete (`2026-06-21-keyboard-navigation-plan` W1/7). This is in-progress, not a defect, but
it is the one system where convergence is genuinely unfinished.

## Recommendations

1. **Re-scope `action-surface-mapping` from a 117-step blanket enrollment to a coverage
   DELTA.** First produce the 6-domain × 3-plane coverage grid as a reference (this audit
   seeds it), then enroll ONLY the verified gaps: `focus-filter`/`clear-filter` palette
   exposure, the right-rail commit/PR verbs, editor `autofix`/`frontmatter`, and the right-rail
   provider asymmetry. Drop steps that re-enroll already-covered verbs or force a verb onto a
   plane it does not belong on (respect the actions-ADR "remove non-capabilities / correct
   plane" discipline). This converts ~117 mechanical steps into a focused gap-closure plan.
2. **Ground the plan with a one-page ADR** recording the coverage-grid decision and the
   per-plane eligibility rule (which verb classes belong on keymap vs context-menu vs palette),
   so future surfaces inherit the rule instead of re-deciding per element.
3. **Add a structural coverage guard test** (mirroring `commandPalette.guard.test.ts`) that
   asserts the grid: for each declared surface verb, that it is enrolled on its eligible
   planes and that its id is identical across them (so accelerator derivation holds). This
   makes coverage mechanically verifiable rather than a manual sweep.
4. **Finish the keyboard-navigation region enrollment** before declaring the action surface
   converged; it is the one unfinished leg.
5. **No re-architecture is warranted.** The registries, the shared descriptor, the id
   namespace, the single persistence, and the TanStack authority are all correct and
   load-bearing. The remaining work is coverage and verification, not structure.

## Codification candidates

- **Rule slug:** `action-verbs-enroll-on-their-eligible-planes-by-shared-id`.
  **Rule:** Every UI verb is one `ActionDescriptor` enrolled on each plane it is eligible for
  (keymap for command shortcuts, the per-kind resolver for target-relative menu verbs, a
  command provider for global palette verbs) under ONE shared action id, so accelerators and
  legends derive correctly; a verb is never forced onto a plane it does not belong on, and a
  coverage guard test asserts the grid.

  *(Candidate only — promote after it holds across the re-scoped `action-surface-mapping`
  cycle, per the codify discipline. Recorded here as the durable constraint this audit
  surfaces.)*

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
