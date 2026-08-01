---
tags:
  - '#research'
  - '#code-tree-legibility'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
related:
  - "[[2026-07-31-visual-review-authored-states-adr]]"
---

# `code-tree-legibility` research: `vs code grade file tree legibility`

## Question

The owner wants the code file tree to read like VS Code's explorer: a user can distinguish markdown files, config files, source files and so on at a glance; gitignored files are visibly distinct; changed files carry their git state. Only the most popular accepted icon library is to be considered. What library is that, how does VS Code actually compose these signals, and what must change on each side of this codebase's wire?

## Findings

### The icon library

- Material Icon Theme (`material-extensions/vscode-material-icon-theme`) is the de-facto standard file-icon set of the VS Code ecosystem, reported at 20+ million marketplace installs — the most-installed icon theme (jeremyshanks.com top-10 survey; marketplace listing `PKief.material-icon-theme`). License: MIT.
- It ships an official npm package, `material-icon-theme`, containing the SVG assets plus a `generateManifest` API that returns the file-name/extension-to-icon mapping JSON following the VS Code icon-theme contract — the exact join needed to map served tree entries to icons without hand-authoring a table.
- Assets are multi-color SVGs (the color IS the legibility: yellow js, blue ts, green markdown check etc.). The library is designed for use outside VS Code and is consumed by web projects via this package.
- Caveat for supply-chain hygiene: a malicious marketplace impersonator of this theme was found in 2025 (Nextron Systems writeup). Irrelevant to bundling the genuine MIT npm package, but the dependency must pin the exact npm name `material-icon-theme` and its integrity hash like any other dependency.
- Runners-up not selected: `vscode-icons` (popular but materially fewer installs; separate mapping package `vscode-icons-js`) and Seti (VS Code's default; visually stale, effectively unmaintained). The owner's constraint — only the most popular accepted library — selects Material Icon Theme outright.

### How VS Code composes the three signals

- File-type icon: from the icon theme, colored, leading the row. Unchanged by git state.
- Git state: carried by the LABEL COLOR plus a trailing one-letter badge — documented theme tokens `gitDecoration.modifiedResourceForeground` (M), `gitDecoration.untrackedResourceForeground` (U), `gitDecoration.addedResourceForeground` (A), `gitDecoration.deletedResourceForeground` (D), `gitDecoration.renamedResourceForeground`, `gitDecoration.conflictingResourceForeground`, each "used for file labels and the SCM viewlet" (code.visualstudio.com/api/references/theme-color, Git colors section).
- Ignored files: SHOWN, dimmed via `gitDecoration.ignoredResourceForeground`; hiding them entirely is a separate opt-in (`explorer.excludeGitIgnore`, default off).
- The three signals compose without conflict because they occupy three different channels: icon = type, label tone + badge = git state, dimming = ignored.

### This codebase today

- The served `FileTreeEntry` is `{path, kind, has_children, node_id}` — no git status, no ignored flag (`frontend/src/stores/server/engine/graphTypes.ts`).
- The engine's tree walk (`engine/crates/ingest-git/src/file_tree.rs`) is deliberately minimal about ignores: it collects only directory-name patterns from `.gitignore` files on the path and HIDES matching directories, with an explicit comment declining a full "second ignore implementation". Rendering ignored entries dimmed reverses that recorded decision, which is ADR territory.
- The engine already computes per-scope changed-file status for the `/ops/git` reads the Changes fold consumes (`frontend/src/stores/server/queries/gitchanges.ts`); the data exists but is not joined into tree levels. The git SSE channel already invalidates the git-changes query family, so per-level status can ride the same invalidation.
- Rust ignore machinery: the engine's git stack is gix, and `gix-ignore` is ALREADY in `engine/Cargo.lock` (transitively). Using gix's own exclude machinery is exactly NOT a second ignore implementation — it is the first one, finally used properly. gix-ignore's `Search` accepts arbitrary pattern buffers, so `.vaultspecragignore` can feed the same matcher as `.gitignore`. The alternative (ripgrep's `ignore` crate, which supports custom ignore filenames directly) would add a second, parallel gitignore implementation beside gix and is therefore the weaker fit despite its convenience API.

### Rules the decision must reconcile

- Wire contract: displayed/filterable state is backend-served — `git_status` and `ignored` must be fields on the served `FileTreeEntry`, never a client-side join of two listings.
- Design system: icons from two families only (Lucide structural, Phosphor domain) and the no-multiple-accents warmth rule. Colored per-type file icons need a RECORDED, SCOPED exception: a third, file-type-only family confined to code file rows. The 14px ink-coverage raster gate was authored for the project's own domain marks; imported multi-color file icons need the ADR to state whether and how it applies.
- Settings: the owner wants the icon set toggleable — one declaration in the engine settings registry (`engine/crates/vaultspec-session/src/settings_schema.rs`), never a hand-wired frontend setting.
- Resource bounds: per-level status join must be memoized (status snapshot per scope, keyed on the git rollup the SSE channel refreshes) and the tree stays bounded exactly as today.

### Risks

- Bundle size: the full icon set is hundreds of SVGs; a tree-shaken subset covering the repo's actual file population (a few dozen types plus a generic fallback) keeps the dev-server and bundle cost small. The mapping manifest makes subsetting mechanical.
- Theming: multi-color icons are theme-agnostic by design (VS Code renders the same colored icons in light and dark); the dimmed/status label tones must come from this project's token tier, not VS Code's palette.
- License: MIT — attribution in the standard third-party notices; no copyleft concerns.

## Options carried forward

1. Adopt Material Icon Theme via its npm package with a scoped ADR exception, serve `git_status` + `ignored` per entry from gix's own machinery, decorate labels VS Code-style from the semantic token tier, and register the icon toggle in the settings schema. (Recommended.)
2. Icons only, no wire change (client-side type icons; defer git/ignore display) — half the legibility, avoids engine work now; the wire half lands later.
3. Author file-type marks in-family on Phosphor's grid — no third family, but monochrome marks reproduce neither VS Code's recognition speed nor the owner's stated expectation, and hand-authoring dozens of marks is sustained cost.

Sources: marketplace.visualstudio.com/items?itemName=PKief.material-icon-theme · github.com/material-extensions/vscode-material-icon-theme · npmjs.com/package/material-icon-theme · code.visualstudio.com/api/references/theme-color · jeremyshanks.com/top-10-best-vs-code-icon-themes · nextron-systems.com 2025-11-28 impersonator advisory
