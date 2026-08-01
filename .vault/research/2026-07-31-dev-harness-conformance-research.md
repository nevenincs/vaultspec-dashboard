---
tags:
  - '#research'
  - '#dev-harness-conformance'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
body_hash: 'sha256:352484f11686c16e11faade27217da6d00ddc1d5696e57d43901c22d11fa17bb'
related:
  - "[[2026-07-30-visual-review-harness-adr]]"
  - "[[2026-06-15-resource-hardening-adr]]"
---

# `dev-harness-conformance` research: `one root dev harness, one platform-agnostic justfile`

The question: what shape should this repository's development harness take, given that
`vaultspec-core` and `vaultspec-rag` have each already solved the same problem and arrived at
DIFFERENT answers? It matters because the current `justfile` is a third shape again — neither
sibling's — and because the harness is the only surface all four teams and every agent touch
daily.

The evidence picture is one-sided. Core's answer (single-command recipes over a stdlib-only
Python dispatch package) is platform-agnostic BY CONSTRUCTION and is the newer of the two. Rag's
answer (PowerShell `switch` blocks embedded in recipe bodies) is hard-bound to one interpreter
and carries three self-documented failure modes in its own comments. This repository's answer
combines the weaknesses of both: `just` string-concatenation dispatch AND dual-dialect shell
branching. Separately — and independently of the shape question — the harness was found to be
structurally unable to gate a pull request, because no CI workflow invokes it.

## Findings

### The current justfile is a third dispatch shape, and the most indirect of the three

`justfile` is 363 lines carrying 52 `_dev-`-prefixed internal recipes reached through 14
`{{ if ... }}` expressions that BUILD A RECIPE NAME AS A STRING and re-enter `just` with it.
The entry point at `justfile:18` is representative: `just dev lint frontend` expands to the
string `just _dev-lint frontend`, which re-enters and expands to `just _dev-lint-frontend`. Two
re-entries per invocation, and the dispatch table is spread across 8 sibling `{{ if }}` chains
rather than stated once.

The cost is not aesthetic. A mistyped target does not produce an error — it produces a
synthesised recipe name that `just` reports as unknown, naming the INTERNAL recipe the user never
typed. Help text is a parallel hand-maintained `_*-help` recipe per verb (8 of them,
`justfile:22`, `:79`, `:105`, `:173`, `:217`, `:254`, `:315`, `:348`), each an `@echo` list that
nothing checks against the recipes that actually exist. `just dev review` was added at
`justfile:307` in the working tree along with its help line, correctly — but nothing would have
failed had the help line been omitted.

### Platform agnosticism is claimed by shell selection and then broken by recipe bodies

`justfile:2-3` declares two interpreters — `sh -cu` and `pwsh.exe -NoProfile -c` — which means
every recipe body must be valid in BOTH dialects or must branch. Five recipes branch, each
carrying two full transcriptions of the same logic behind `{{ if os() == "windows" }}`:
`_dev-lint-toml` (`justfile:118`), `_dev-lint-typos` (`:150`), `_dev-fix-toml` (`:185`),
`_dev-audit-rust` (`:235`), `_dev-test-bench` (`:268`). The first four are the same
tool-or-Docker-or-fail pattern written four times in two dialects — eight transcriptions of one
idea, each independently able to drift.

The `sh -cu` default is itself a Windows hazard core documents directly: on Windows it resolves
to a Git Bash `sh.exe` that is only on `PATH` for SOME Git for Windows install options
(`vaultspec-core/justfile:66-71`).

### Core solved this by deleting shell logic, not by writing it twice

`vaultspec-core/justfile` is 203 lines and every recipe body is a SINGLE command with no pipes,
no conditionals, and no dialect: `lint target='all':` → `{{dev}} lint {{target}}`, where `dev`
is `uv run --no-sync python -m dev` (`vaultspec-core/justfile:80`). Target dispatch, step
chaining, tool-or-Docker fallback and advisory-versus-gating exit codes all live in
`vaultspec-core/dev/`, which imports only the standard library and therefore behaves identically
everywhere. Because no recipe body contains shell syntax, `cmd` and `sh` execute all of them
identically, and `set windows-shell := ["cmd.exe", "/c"]` (`vaultspec-core/justfile:72`) names
the one interpreter every Windows machine is guaranteed to have.

The package is three layers. `dev/runner.py` (162 lines) holds process primitives as frozen
dataclasses — `Cmd`, `ToolOrDocker`, `Echo`, `Ref` — so a step is DATA. `dev/toolchain.py` (802
lines) states the entire toolchain as one declarative table of those steps. `dev/__main__.py`
(149 lines) is the dispatcher. Aggregates are expressed as `Ref` references rather than repeated
steps, "so a target and its use in an aggregate cannot drift apart" (`dev/runner.py:71-78`) —
the structural fix for the drift this repository's hand-maintained `_*-help` recipes invite.

Core's instruments sit one level below the dispatch core — `dev/audit`, `dev/binaries`,
`dev/health`, `dev/statistics` — each with a cohabiting `tests` package, and each free to depend
on whatever it measures with, precisely because it is NOT in the stdlib-only dispatch path.

### Core does not centralise for its own sake — locality is an explicit exception

One core instrument lives OUTSIDE `dev/`: the documentation-asset renderers in `docs/_render/`,
which "sit with the `docs/assets/` output they write rather than with the tooling that invokes
them" (`vaultspec-core/justfile:25-27`). This is a codified precedent that the canonical `dev/`
home is about eliminating COMINGLING, not about relocating every dev file to one path regardless
of what roots it. It bears directly on `frontend/dev/`, which is rooted by `vite`, `tsconfig`,
`vitest` and `playwright` configuration and cannot move without rewriting all four.

### Rag is the pattern to move away from, and says so in its own comments

`vaultspec-rag/justfile:3-4` binds BOTH `shell` and `windows-shell` to
`pwsh -NoProfile -File scripts/run-just-recipe.ps1`, so the harness cannot run without
PowerShell and a repo-local shim script. Recipe bodies are hand-written PowerShell `switch`
blocks joined into one logical line by trailing backslashes.

Three failure modes are recorded in that file's own comments, and all three are consequences of
putting logic in the shell rather than beside it:

- A `#` comment inside a joined switch body "runs to the end of the joined line and silently
  swallows every case after it, closing braces included" — annotated three times
  (`vaultspec-rag/justfile:115-117`, `:306-308`, `:394-398`), the third noting it "broke every
  target, not just `gpu`, the last time it happened".
- Step chaining needs a hand-written `if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }` after
  EVERY step; `lint all` carries eleven of them (`vaultspec-rag/justfile:203-230`). One omission
  is a silently non-gating gate.
- A complexity gate "reached the default branch unseen: the markdown step fails earlier in the
  same CI job and aborts it, so the complexity step never ran. A gate behind a red gate is not a
  gate." (`vaultspec-rag/justfile:110-113`)

Rag also records shipping "a CI step labelled report-only that gated" (`:298-301`) — a check
whose documented contract and actual exit code disagreed.

### Dev tooling is comingled across four homes with no rule binding any of them

Development tooling in this repository currently lives at:

- `scripts/render_readme_assets.py` — one Python file in a root `scripts/` directory that exists
  for it alone.
- `packaging/assemble-build-spec.py`, `packaging/install.ps1`, `packaging/install.sh` — release
  and installer tooling beside `packaging/winget/` and two tracked lock/matrix JSONs.
- `frontend/dev/**` — 21 modules in `tooling/`, plus `labs/`, `visual-review/`, `spike/`,
  `scratch/`, `demo-vault/` and four `playwright.*.config.ts` files.
- The `dev` dependency group in `pyproject.toml:77`, whose only consumers are the harness recipes.

Only ONE of these four has a fence: `frontend/dev/` was fenced by the in-flight
`visual-review-harness` work, whose D7 states `dev/**` may import `src/**` and `src/**` importing
`dev/**` is a build failure, enforced by `frontend/dev/tooling/scan-domains.mjs`. Nothing binds
`scripts/`, `packaging/`, or the dependency group, and nothing at all validates that a dev
concern has not been added to a shipped tree — the fence is frontend-local and one-dimensional.

That D7 fence is load-bearing evidence in the other direction too: it was authored because the
boundary "previously failed in four places at once — a dev-only prop on a shipped component, a
dev module inside the production stores layer, dev copy compiled into the shipped localization
catalog, and five harnesses under `src/`. Each passed review individually. Convention did not
hold; the gate does."

### The harness cannot gate a pull request, because CI never invokes it

No workflow in `.github/workflows/` invokes `just`. `quality-gates.yml:1-2` describes itself as
the pipeline "that mirrors `just dev lint` and `just dev audit`" — mirrors, by hand, in YAML.

The mirror is not faithful. `_dev-lint-frontend` (`justfile:133-142`) runs NINE npm scripts;
`quality-gates.yml` runs three of them — `lint` (`:153`), `format:check` (`:155`), `typecheck`
(`:157`) — plus `test` (`:191`). The six that run ONLY on a developer's machine and never on a
pull request are `lint:localization`, `lint:px`, `lint:domains`, `lint:modules`, `tokens:check`
and `figma:names`.

This is materially worse than a coverage gap. `dev-workflow.md` instructs that "the reviewer runs
the full recipe independently" and that a change is not green until the frontend lint gate exits
0 — a rule whose enforcement is entirely honour-system, because the automation that could enforce
it runs a different, smaller check and reports green. `production-dev-separation.md` names
`scan-domains.mjs` as THE gate holding the src/dev fence, and that scanner is one of the six CI
never runs.

The cost is not hypothetical. `lint:modules` is also among the six, and
`engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs` stands at 1629 lines against that
gate's hard 1500-line cap with an EMPTY ratchet (`frontend/dev/tooling/module-size-baseline.json`
is `{}`) — measured on the committed tree, not a working copy. The gate has therefore been failing
on the default branch, and nothing reported it, because the only automation that could is the
automation that does not run it.

No re-implementation of the gate in YAML can be verified to match the gate; only invoking the
same entry point can. This finding is independent of which harness shape is chosen — it is not
fixed by the refactor, and would survive it unless deliberately addressed.

### The invocation string `just dev …` is load-bearing in the rule corpus

Collapsing `just dev <verb>` to `just <verb>` is not a private rename. Four rule sources under
`.vaultspec/rules/` cite the current strings — `dev-workflow.md` (`just dev lint frontend`,
`just dev lint all`, `just dev test frontend`, `just dev test rust`), `design-system.md`
(`just dev lint frontend`), `production-dev-separation.md` (`just dev lint frontend`), and
`resource-bounds.md` (`just dev clean`) — and each is regenerated into FOUR provider directories
(`.agents/`, `.claude/`, `.codex/`, `.gemini/`) by `vaultspec-core sync`. Rule sources are
hand-edited and synced; the generated copies are never edited directly. Non-rule citations sit in
`README.md`, `typos.toml`, `engine/deny.toml:4`, `frontend/dev/dev-ports.ts:34` and
`frontend/dev/README.md:18`. Historical `.vault/` records cite the old strings and are left
alone — a record states what was true when written.

### Not investigated

Whether the engine's Rust-side dev surface (`engine/tests/`, `engine/deny.toml`) should also be
rehomed was not examined; it is cargo-rooted and was assumed to stay, on the same locality
grounds as `frontend/dev/`. Whether `packaging/` is dev tooling or a shipped artifact source was
not settled and is left for the ADR. No measurement was taken of harness invocation latency, so
the added `uv run --no-sync python -m dev` hop is an unquantified cost.

## Sources

- `justfile:2-3`, `:18`, `:22`, `:79`, `:105`, `:118`, `:133-142`, `:150`, `:173`, `:185`,
  `:217`, `:235`, `:254`, `:268`, `:307`, `:315`, `:348`
- `vaultspec-core/justfile:25-27`, `:66-71`, `:72`, `:80`
- `vaultspec-core/dev/runner.py:71-78`; `vaultspec-core/dev/toolchain.py`;
  `vaultspec-core/dev/__main__.py`
- `vaultspec-rag/justfile:3-4`, `:110-113`, `:115-117`, `:203-230`, `:298-301`, `:306-308`,
  `:394-398`
- `.github/workflows/quality-gates.yml:1-2`, `:153`, `:155`, `:157`, `:191`
- `pyproject.toml:77`; `mise.toml`; `frontend/package.json`
- `.vaultspec/rules/dev-workflow.md`, `design-system.md`, `production-dev-separation.md`,
  `resource-bounds.md`; `engine/deny.toml:4`; `frontend/dev/dev-ports.ts:34`;
  `frontend/dev/README.md:18`
- Sibling repository paths are given relative to their own checkouts
  (`Y:/code/vaultspec-core-worktrees/main`, `Y:/code/vaultspec-rag-worktrees/main`) as read on
  2026-07-31.
