---
tags:
  - '#research'
  - '#workspace-picker-dialog'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-12-single-app-runtime-adr]]'
  - '[[2026-06-14-dashboard-workspace-registry-adr]]'
  - '[[2026-06-20-left-rail-top-adr]]'
---

# `workspace-picker-dialog` research: `production-grade add-project folder picker`

The add-project dialog (the "workspace picker") is the surface through which an
operator registers a project root: a typed-path prompt with a collapsible one-level
folder browser. It is reported buggy, hard to navigate, has no Figma design, and
lacks the standard controls of a production folder picker. This research grounds a
redesign decision: what exists, what governs it, what is broken or missing, and what
the well-trodden UX patterns for an in-app (non-native) folder picker are.

## Findings

### 1. Current implementation inventory

- **Dialog** — `frontend/src/app/left/AddProjectDialog.tsx`: kit `Dialog` with a
  monospace path `input`, a "Browse…" text-link toggle disclosing `FolderBrowser`,
  an error line, Cancel / Add project footer. Registration rides `useAddWorkspace`
  (sole wire client); errors are mapped to three friendly variants by regexing the
  thrown message (`addProjectErrorMessage`).
- **Browser** — `frontend/src/app/left/FolderBrowser.tsx`: pure resolver
  (`deriveFolderBrowserView`) + thin wired wrapper over `useFsList`. One flat
  listbox per level (roots → subdirectories), a `..` row, `Project` / `Git
  repository` badges, a header "Choose this folder" button, widget-intrinsic roving
  tabindex, `max-h-48` scroll area.
- **Chrome state** — `frontend/src/stores/view/addProjectChrome.ts`: zustand
  disclosure + path draft + error (bounded at 1024 chars); idempotent
  `openAddProjectDialog`. Browse level lives as component-local state in the dialog.
- **Wire seam** — `frontend/src/stores/server/queries/fsBrowse.ts`: `useFsList`
  over `GET /fs/list`, per-directory cache keys, manual retry only.
- **Engine route** — `engine/crates/vaultspec-api/src/routes/fs_browse.rs`:
  read-only, bearer-gated. No `path` → filesystem roots (Windows drive letters via
  `A:`–`Z:` probe, `/` elsewhere); absolute `path` → immediate subdirectories only,
  name-sorted, capped at `MAX_ENTRIES = 256` with stated `truncated`. Each row
  carries `is_managed` (`.vault/` present) and `is_git` (`.git` exists). Unreadable
  children skipped silently. Paths normalized to forward slashes.
- **Registration seam** — `useAddWorkspace` in
  `frontend/src/stores/server/queries/workspaces.ts` rides `PUT /session`
  (`add_workspace`), which validates the path is a discoverable git workspace,
  registers, warms, and selects it (dashboard-workspace-registry ADR).

### 2. Consumers — every entry funnels into this one dialog

- `WorktreePicker` (desktop left-rail dropdown): pinned first row "Add a project".
- `ProjectNavigator` ("Switch project" popup): footer "Open project…" button.
- `WorkspaceSwitcherSheet` (compact/mobile bottom sheet): re-presents the same
  projection with the same add affordance.
- `FirstRunOnboarding` (whole-shell empty-registry branch): "Add your first
  project" fires the shared `project:open` action and mounts its own
  `AddProjectDialog` instance.
- Command palette + keymap under the one shared `left-rail:add-project` action id
  (`projectActions.ts`, actions-keymap-palette rule).

A redesign of the dialog therefore upgrades all five entry points at once; none of
them holds a private variant.

### 3. Governing decisions

- **single-app-runtime ADR (2026-07-12), option O6** — a native folder picker was
  explicitly *deferred*; the in-app browser over `GET /fs/list` (step S24) was built
  as the closing of that deferral. The browser-cannot-open-native-dialogs constraint
  stands: the picker must remain an in-app, engine-served browse surface.
- **dashboard-workspace-registry ADR (2026-06-14)** — registration semantics are
  settled: operator-supplied absolute path, validated engine-side (git workspace
  discoverable), read-only, honest tiers-bearing refusal, add/select/forget via the
  `PUT /session` config surface. The redesign must not grow a second registration
  path.
- **left-rail-top ADR (2026-06-20), D1** — the rail-side `WorkspacePicker` trigger
  and project→worktree chooser have Figma nodes ("the Figma prototypes already
  built (the `WorkspacePicker` node …)"), but the *add-project dialog and folder
  browser have no Figma design at all* — confirmed gap against the design-system
  rule (Figma is the binding source of truth; a production surface without a bound
  frame is a violation to close, not a nicety).

### 4. Defects and gaps observed in the current picker

Bugs / behavioural defects:

- **Browse never seeds from the typed path.** Opening "Browse…" always starts at
  filesystem roots, even when the input already holds a deep absolute path; the
  operator re-drills from the drive letter every time.
- **Focus is dropped on navigation.** Each level change unmounts the clicked row;
  focus falls back to `body`, breaking the keyboard flow mid-drill (the roving
  tabindex resets `activeIndex` but nothing refocuses the list).
- **Choose-vs-navigate is inverted from convention.** Clicking a row only
  *navigates into* it; choosing requires noticing the separate header button. There
  is no way to select a visible folder without entering it, no double-click or
  Enter-to-choose distinction, and the browser cannot choose at the roots level.
- **Level flashes.** No `placeholderData: keepPreviousData` on `useFsList`, so
  every navigation blanks the list into a skeleton, which also causes the focus
  drop above to recur per level.
- **Enter in the path input submits while browsing**, racing a half-finished
  drill against registration.
- **Fragile error mapping.** Friendly-message selection regexes the raw engine
  message; any engine wording change silently degrades to the generic variant
  (wire-contract smell: the client is sniffing message text, not a typed reason).

Missing production-picker features:

- No breadcrumb path bar (the header shows one truncated monospace string).
- No shortcuts: home directory, known places, registered-projects jump list, or
  recent locations. On Windows every session starts at `A:`–`Z:`.
- No path autocomplete / validate-as-you-type on the text input.
- No in-level filter box, so a truncated 256-entry level (stated but unsearchable)
  is effectively unnavigable.
- No hidden/system-folder handling: `$RECYCLE.BIN`, `AppData`, dotfolders all
  render at full weight, burying real project folders.
- No `is_registered` marker — already-registered roots are indistinguishable, so
  re-adding an existing project is a round-trip failure instead of a disabled row.
- No sort or grouping beyond name-sort; git/managed folders are not surfaced ahead
  of noise.
- Cramped geometry: the whole browse surface is a `max-h-48` (12rem) strip inside
  a standard dialog; real pickers give the tree the dialog.

Engine-side gaps (`/fs/list`):

- Serves no `is_hidden` flag, no home/known-places discovery, no filter/query
  param, no registered-root cross-reference, no drive labels/types on Windows
  roots, and does blocking `read_dir` + per-row probes on the async runtime
  (acceptable at 256 rows, worth noting for a richer projection).
- Not exercised by any frontend test with a live engine beyond the resolver's
  wire-free unit tests; `fs_browse.rs` has three Rust unit tests.

### 5. Best-practice patterns for in-app folder pickers

Surveyed conventions from VS Code's remote/web "Open Folder" quick-pick, JetBrains'
in-IDE directory chooser, and the OS-native dialogs the operator expects
(re-fetchable: VS Code `src/vs/platform/dialogs` simple file dialog; macOS
`NSOpenPanel` / Windows `IFileOpenDialog` documented behaviors):

- **Editable path field + browser are one control, not two modes.** The path field
  reflects the browsed location live; typing a path re-roots the browser;
  autocomplete offers child-directory completions (VS Code's pattern).
- **Breadcrumbs** for the current location, each segment clickable, with an
  overflow/root affordance — replaces both the `..` row and the truncated header.
- **Places rail**: home, drives/roots, and domain shortcuts (here: registered
  projects, recent locations — the machine-global launcher recents already exist as
  `useProjectHistory`).
- **Single-click selects, double-click / Enter navigates, explicit primary button
  confirms** — selection state distinct from navigation, so any visible folder is
  choosable without entering it; the primary button carries the selected folder's
  name ("Add `dashboard`").
- **Type-ahead filter within the level** (also the answer to truncation).
- **Hidden folders de-emphasized or toggleable**, never interleaved at full weight.
- **Domain affordance**: rows that *are* eligible targets (git/managed) rendered
  as first-class candidates (badge + grouping or sort precedence); already-added
  roots marked and non-actionable. Validation happens as the selection changes,
  not only on submit.

### 6. Redesign surface for the ADR to decide

- **Scope**: dialog + browser + `useFsList` seam + `/fs/list` projection
  enrichment (hidden flag, registered marker, optional home/places, optional
  per-level filter), leaving registration (`add_workspace`) and all five entry
  points untouched.
- **Design**: author the Figma frames first (design-system rule), covering default,
  browsing, selected, error, truncated, degraded, and first-run contexts, desktop +
  compact.
- **Open questions for the ADR**: where selection state lives (chrome store vs
  component); whether the engine grows a `places` block or the client composes it
  from existing seams (`useProjectHistory`, `useWorkspaces`); whether error
  reasons should become typed on the wire instead of regex-sniffed; how far the
  path-autocomplete goes (engine round-trip per keystroke vs on-demand).

### Sources

- `frontend/src/app/left/AddProjectDialog.tsx`, `FolderBrowser.tsx`,
  `ProjectNavigator.tsx`, `WorktreePicker.tsx` (worktree dropdown + pinned add row)
- `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`,
  `frontend/src/app/onboarding/FirstRunOnboarding.tsx`
- `frontend/src/stores/view/addProjectChrome.ts`,
  `frontend/src/stores/view/projectActions.ts`
- `frontend/src/stores/server/queries/fsBrowse.ts`,
  `frontend/src/stores/server/queries/workspaces.ts`
- `engine/crates/vaultspec-api/src/routes/fs_browse.rs` (route + 3 unit tests)
- ADRs in `related:` frontmatter (single-app-runtime O6/S24,
  dashboard-workspace-registry, left-rail-top D1)
- VS Code simple file dialog (`microsoft/vscode` `src/vs/platform/dialogs`),
  macOS `NSOpenPanel` and Windows `IFileOpenDialog` documented conventions
