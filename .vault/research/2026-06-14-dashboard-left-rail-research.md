---
tags:
  - '#research'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-sidebar-adr]]"
  - "[[2026-06-14-dashboard-worktree-switcher-adr]]"
  - "[[2026-06-14-user-state-persistence-adr]]"
---

# `dashboard-left-rail` research: `left-hand scope rail completion`

The dashboard's left rail (the leftmost of the four `AppShell` regions — left
scope rail, center stage, right activity rail, bottom timeline) is the operator's
*navigation* surface: it answers "which project, which worktree, which document am
I pointed at". A proposed UI iteration extends what the rail offers — multiple
project roots, a real codebase file tree, an in-rail filter — beyond what the
accepted ADRs and the shipped engine currently support. This research maps the
*current decided surface* against the proposed surface, separates settled from
unsettled, and grounds the ADR campaign that closes the gap so the frontend is not
built against capabilities the backend does not expose. It does not decide; it
inventories and triages.

The four campaign forks were settled by the operator before this research was
stamped: the rail stays **read-only navigation** (no git/disk mutation); the
workspace model gains a **multi-project-root registry**; the file browser gains a
**codebase file tree** alongside the vault browser; and the **code is the spec**
(there is no Figma — the design language ADRs plus the token layer plus the current
frontend are the grounding, and new UI is authored against them).

## Findings

### F1 — The rail today is two surfaces, both read-only projections

`AppShell.tsx` frames the rail as a collapsible `aside` (16rem expanded, ~2.5rem
collapsed) driven by `leftRailCollapsed` in the view store, headed "Scope". It
stacks exactly two hosted surfaces, each its own accepted ADR:

- The **worktree switcher** (`WorktreePicker.tsx`, `dashboard-worktree-switcher`
  ADR) — the scope chooser. Reads `GET /map` (repository → branch → worktree),
  renders a compact two-level picker, and on selection fires the view store's
  `setScope`, the **wholesale-stateless scope swap** (foundation finding 022) that
  resets every per-scope store so no filter/lens/pin/selection/timeline residue
  bleeds across corpora. It shows an inline git sync badge (ahead/behind/dirty)
  pulled from the live status hook — read-only status, never controls.
- The **vault file browser** (`VaultBrowser.tsx`, `dashboard-sidebar` ADR) — a
  read-only projection over `GET /vault-tree?scope=` grouping `.vault/` documents
  by doc-type subtree (research, adr, plan, exec, audit, reference, index). Each
  row carries a Phosphor doc-type mark, the stem (monospace identity), the first
  feature tag, and a freshness label. Selection is the bidirectional join in
  `browserSelection.ts`: a row maps to the contract node id `doc:<stem>`, focuses
  the stage node, and the active stage selection highlights the matching row.

Both surfaces obey the layer-ownership law: they consume stores hooks, never
`fetch`, never mint a private node identity, and read the `tiers` degradation block
only through a selector. Both render the four honest states (loading, empty,
degraded, error). This is the settled baseline the campaign extends, not replaces.

### F2 — Coverage triage of the proposed LHS requirements

Mapping the proposed rail against accepted ADRs and the shipped engine:

- **Vault file browser** — FULLY DECIDED. `dashboard-sidebar` + `GET /vault-tree`.
  Note it is a doc-type-grouped tree, not a flat list; an in-rail flat/filtered
  view is named as a pathway in the sidebar ADR but not decided.
- **Vault-node ↔ graph interlinking** — DECIDED. Stable `doc:<stem>` ids, the
  `browserSelection.ts` bidirectional join. Code-node interlinking is undecided
  only because there is no code-tree surface yet (see F4).
- **File search** — DECIDED, but right-rail. `dashboard-search` (surface) +
  `dashboard-rag-search` (controller) + `POST /search` pass-through to rag. It is
  the global semantic search pillar, not an in-rail filter over the current tree.
- **Application-wide action interface** — DECIDED, not a rail surface.
  `dashboard-command-palette` is a lifted `Ctrl/Cmd-K` overlay, not a left-rail
  panel. The rail may host an entry point but owns no command logic.
- **Worktree/branch switching** — DECIDED. `dashboard-worktree-switcher`. "Switch"
  means change the read scope, not `git checkout`; branch/worktree classification
  is advisory display only.
- **Workspace / project root** — PARTIALLY DECIDED, and the campaign's largest
  gap (F3).
- **Codebase file tree** — NOT DECIDED, and the campaign's second gap (F4).
- **Embedded git controls** — bounded by F5; read-only status only, no mutation.

### F3 — Multi-workspace is anticipated by the contract but not built

The engine is **single-workspace by construction**: at boot it runs
`Workspace::discover(&cwd)` and binds one git repository (workspace = the git
common dir). `GET /map` enumerates the repository's branches and worktrees; a
worktree is a *scope* within that one workspace, and scope is fully stateless on
the wire (foundation §3, REDLINE-1 dropped `POST /scope`). The
`user-state-persistence` ADR then landed the co-resident `vaultspec-session`
orchestration crate holding a **warm multi-scope registry** (N per-scope graphs,
each with its own watcher, delta clock, and resume ring, LRU-bounded), making
*worktree* switching instant — but still within the one discovered workspace.

Two facts make multi-workspace a clean extension rather than a new architecture.
First, the durable session store already keys state `<domain>:<workspace>:<scope>`
— the *keying anticipates multiple workspaces* even though discovery binds one.
Second, the `vaultspec-session` ADR re-drew `engine-read-and-infer` as a
**semantic** fence: the orchestration crate is the sanctioned layer that "may hold
durable session state and select workspaces" while still never writing `.vault/`
documents, mutating git refs/trees/config, or growing sibling semantics. A
registry of *which project roots exist* is therefore user-state config (the same
class as the session/settings the crate already persists), categorically distinct
from the forbidden mutation of workspace *content*. The worktree-switcher ADR even
names "a multi-repository grouping … or a future multi-scope composition the
contract keeps open by keeping scope a parameter" as an opened pathway. What is
missing is concrete: a persisted root registry, an enumeration surface across
roots, a workspace identity on the wire, and a rail control to add/select/forget a
root — with a workspace switch resetting scope at least as wholesale as a worktree
switch (the 022 invariant, widened).

### F4 — There is no generic file-tree surface; the vault tree is the only listing

`GET /vault-tree` lists `.vault/` documents (metadata only) and is the *only*
filesystem-listing endpoint. Code artifacts exist in the graph as `code:<path>`
and `code:<path>#<symbol>` nodes (the structural tier indexes the worktree), and
`GET /nodes/{id}` / `/neighbors` reach them, but there is **no endpoint that lists
the working tree as a browsable directory hierarchy**. A codebase file browser
therefore needs a new read-only listing endpoint. Reading and listing files is
squarely within read-and-infer (it is inference's own input); the structural tier
already walks the worktree, so the file-tree read shares that substrate. The
interlinking primitive already exists: a listed file path maps to the stable
`code:<path>` node id by the same `node_id(...)` derivation the search annotator
and graph use, so file↔graph selection joins exactly as the vault browser's
`doc:<stem>` join does. Bounding and gitignore-awareness are the real design
questions (a large repo's tree must not produce an unbounded body, mirroring the
graph's `MAX_GRAPH_NODES` and cursor-pagination discipline).

### F5 — Read-only is a hard, load-bearing invariant the campaign must not break

`engine-read-and-infer` (and foundation §9 non-goals) forbid the engine from
writing `.vault/` documents and from mutating git refs/trees/config; the only
writes that transit the engine are the whitelisted `/ops/*` sibling verbs,
forwarded verbatim. The operator confirmed the rail stays read-only: "switching" a
worktree or workspace is a *view-scope* change, branch navigation is advisory
display, and git surfacing is *status* (ahead/behind/dirty, changed-file lists,
read-only diffs per `dashboard-git-diff-browser`) — never stage/commit/checkout/
worktree-add. The one nuance to state explicitly so a future agent does not read it
as a violation: persisting the **workspace registry and session selection** is
user-state config owned by `vaultspec-session`, not content mutation, and is
already sanctioned by the `user-state-persistence` decision.

### F6 — The design grounding is settled; new UI is authored against it

There is no Figma or Storybook. The authoritative UI grounding is the
`dashboard-design-language` ADR (attenuated chrome that cedes attention to the
stage; OKLCH token tiers on `:root`; one muted accent; soft 1px borders;
keyboard-first; tabular numerals on data; monospace for true identity; warmth only
in tokens), the `dashboard-iconography` ADR (Lucide for structural chrome, Phosphor
for domain marks, 14px grayscale-by-shape gate), and the token layer in
`styles.css`. New rail surfaces (workspace switcher, code tree, in-rail filter) are
specified as faithful applications of those laws, exactly as the sidebar and
worktree-switcher ADRs were — they re-decide none of the base language. The
operator's direction: author the design here, import to Figma later for refinement
within the framework.

### F7 — The resulting campaign shape

The triage yields one umbrella IA decision plus two capability decisions:

- An **information-architecture ADR** pinning how the complete rail composes —
  workspace switcher (new) above worktree switcher (existing) above a browser that
  carries both a vault mode (existing) and a code mode (new), with an in-rail
  filter affordance and read-only git status — and restating the read-only
  navigation law and the hosted-slot composition for the whole rail. It re-decides
  nothing the sibling ADRs settled; it sequences and bounds them.
- A **multi-workspace registry ADR** (backend + frontend): the persisted
  project-root registry in `vaultspec-session`, the enumeration surface, workspace
  identity on the wire, and the workspace switcher with its widened wholesale
  reset.
- A **codebase file-tree ADR** (backend + frontend): the bounded, gitignore-aware,
  lazy read-only listing endpoint, the `code:<path>` interlink, and the code-tree
  rail mode with honest structural-tier degradation.

The command palette and the global search pillar are referenced as settled
siblings, not re-opened.
