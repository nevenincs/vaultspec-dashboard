---
tags:
  - '#adr'
  - '#code-tree-legibility'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
related:
  - "[[2026-08-01-code-tree-legibility-research]]"
---
# `code-tree-legibility` adr: `file-type icons, ignore dimming, and served git status` | (**status:** `accepted`)

## Problem Statement

The code file tree renders every file with the same generic treatment: a user cannot tell a markdown file from a config file from source at a glance, cannot see which files are gitignored, and cannot see which files carry uncommitted changes. This is table-stakes explorer legibility that VS Code established as the norm. The owner's review note asks for exactly that norm, with the constraint that only the most popular accepted icon library be considered.

## Considerations

- The served tree entry carries no type, status, or ignore information beyond the path itself; everything displayed must be backend-served per the wire contract (research: findings on `FileTreeEntry` and the wire-contract rule).
- The engine already computes per-scope git status for the changes reads, and its gix stack already contains `gix-ignore`; the current walk's minimal ignore handling was a recorded decision this record deliberately revisits (research: this-codebase-today).
- The design system's two-family icon law and single-accent warmth rule directly conflict with colored per-type file icons, which are the recognized convention the owner is asking for (research: rules-to-reconcile).
- VS Code composes the three signals on three channels â€” icon = type, label tone + badge = git state, dimmed label = ignored â€” documented by its `gitDecoration.*` theme tokens (research: how-vs-code-composes).

## Considered options

1. Material Icon Theme via its official npm package + served `git_status`/`ignored` fields + token-tier label decorations. Full legibility; requires a scoped design-system exception and engine work. CHOSEN.
2. Client-side icons only, wire change deferred. Ships half the value; the git/ignore half is the part the owner called out first. Kept only as a fallback sequencing if engine capacity stalls.
3. Hand-authored monochrome file marks on Phosphor's grid. Preserves the two-family law but fails the actual requirement (instant type recognition as VS Code users know it) at sustained authoring cost. Rejected.

## Constraints

- D1 â€” One library, pinned: the file-type icon set is `material-icon-theme` (MIT, the ecosystem's most-installed set, 20M+ marketplace installs), consumed from the official npm package with its `generateManifest` mapping; a tree-shaken subset (common types + one generic fallback) is bundled, never the full set. No second file-icon source may be added later without superseding this record.
- D2 â€” Scoped exception to the two-family icon law: colored file-TYPE marks are sanctioned ONLY on code file-tree rows (and future code-file listings that reuse the same row primitive). Chrome and domain marks stay Lucide/Phosphor; the 14px ink-coverage gate continues to govern authored domain marks and does not admit imported file icons anywhere else. The design-system rule text gains this exception clause on execution.
- D3 â€” Displayed state stays served: `FileTreeEntry` grows `git_status?` (token vocabulary: `modified` / `added` / `deleted` / `renamed` / `untracked` / `conflicted`, absent = clean) and `ignored?` (absent = not ignored, `git` | `rag` = which ignore file matched). Counts or rollups, if ever shown, are engine-computed. The frontend maps tokens to presentation only.
- D4 â€” Ignore truth comes from gix: the walk adopts gix's own exclude machinery (`gix-ignore`, already in the dependency tree) evaluating `.gitignore` semantics properly, with `.vaultspecragignore` patterns fed through the same matcher and reported distinctly. Ignored entries are SERVED AND SHOWN (dimmed), not hidden; this supersedes the walk's hide-matching-directories behavior and retires its directory-name-only pattern collection. The ripgrep `ignore` crate is rejected â€” it would be a second gitignore implementation beside gix.
- D5 â€” Status join is bounded: per-level `git_status` joins against the engine's existing per-scope status snapshot, memoized on the same git rollup the git SSE channel already refreshes; a level serve never spawns its own git subprocess. Existing level pagination, ceilings, and truncation semantics are unchanged.
- D6 â€” Presentation from the token tier: label tones for modified/added/deleted/untracked/conflicted/ignored come from this project's semantic tokens (new `status`-family aliases mirroring the roles VS Code's `gitDecoration.*` tokens fill), never hardcoded VS Code colors. Ignored = dimmed ink; git state = label tone plus a one-letter trailing badge; the colored type icon is state-independent. All three signals compose per row.
- D7 â€” The icon set is a setting: one engine settings-registry declaration (`code_tree.file_icons`, default on) resolves through the schema route like every setting; off falls back to the current single generic mark. No other dev-only toggle, no frontend-local persistence.
- D8 â€” Supply-chain pin: the dependency is the exact npm name `material-icon-theme` with lockfile integrity; a marketplace impersonator of this theme exists, so any future source change is a reviewed event.

## Implementation

Engine first: extend the file-tree walk with gix-based ignore evaluation (git + ragignore) and the memoized status join; serve the two new optional fields; declare the setting. Stores next: adapt the widened `FileTreeEntry` through the tolerant adapters and expose the setting's effective value. Frontend last: bundle the tree-shaken icon subset with the manifest-derived extension mapping behind the setting, and render the three-channel row treatment (icon, label tone + badge, dimming) from semantic tokens. Tests ride each layer: walk-level ignore/status fixtures engine-side, adapter tolerance for absent fields, and row-rendering tests over served tokens. The desk's CodeTree specimen gains authored `git_status`/`ignored` values so all states stay reviewable.

## Rationale

The owner named the outcome (VS Code-norm legibility) and the selection rule (only the most popular accepted library), which the research resolves to Material Icon Theme without a survey. Serving status and ignore truth from the engine is the only shape the wire contract permits, and gix's own machinery makes the previously-declined ignore work no longer a second implementation â€” the original objection dissolves rather than being overridden. The design-system exception is real but scoped, recorded, and confined to the one surface whose whole purpose is file-type recognition.

## Consequences

- Users get type recognition, ignore dimming, and change visibility in one row treatment; the tree finally answers what changed and what is noise without opening anything.
- A third icon family exists in the codebase, fenced to file rows; the design-system rule text must carry the exception clause, and reviewers must hold that fence.
- The engine's tree levels each carry a status join; the memoization keyed on the git rollup bounds it, but a pathological repo with enormous status output stresses the same bound the changes reads already live under.
- The retired hide-ignored behavior changes what users see: previously-hidden directories appear (dimmed). The setting governs icons only; ignore dimming and status tones are unconditional truth, not preferences.
- `.vaultspecragignore` semantics get their first server-side interpreter; rag remains the authority on what it indexes â€” the tree only reports the file's ignore provenance, never infers indexing state.
