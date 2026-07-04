set positional-arguments := false
set shell := ["sh", "-cu"]
set windows-shell := ["pwsh.exe", "-NoProfile", "-c"]



default:
  @echo "Available commands:"
  @echo "  dev <target>      Development toolchain (deps, lint, fix, audit, test, build, etc.)"
  @echo "  ci                Full CI pipeline: lint → vault check → test"
  @echo ""
  @echo "Run 'just <command> --help' for more details."

# ===========================================================================
#  dev  - development toolchain (linters, formatters, tests, builds)
# ===========================================================================

dev target='--help' *args='':
  @{{ if target == "--help" { "just _dev-help" } else if target == "-h" { "just _dev-help" } else if target == "help" { "just _dev-help" } else { "just _dev-" + target + " " + args } }}

_dev-help:
  @echo "Usage: just dev <target> [args...]"
  @echo ""
  @echo "Targets:"
  @echo "  deps      dependency management (sync, upgrade, lock)"
  @echo "  lint      read-only static analysis (taplo, markdownlint, clippy, eslint, ...)"
  @echo "  fix       auto-fix everything fixable (toml, markdown, vault, rust, frontend)"
  @echo "  audit     supply-chain / security checks (uv audit, cargo-deny, npm audit)"
  @echo "  test      rust + frontend (vitest)"
  @echo "  build     rust + frontend"
  @echo "  serve     live dev survey: engine + Vite HMR, auto-rebuild + auto-refresh"
  @echo "  clean     reclaim dev artifact sprawl (cargo target, dead worktrees, tmp)"
  @echo "  tokens    regenerate the DTCG color CSS and check parity/drift"
  @echo "  precommit pre-commit hook management (install, upgrade, run)"

# ===========================================================================
#  ci  - full pipeline: lint → vault check → test
# ===========================================================================

ci *args='':
  @{{ if args == "--help" { "just _ci-help" } else if args == "-h" { "just _ci-help" } else if args == "help" { "just _ci-help" } else { "just _ci-run" } }}

_ci-help:
  @echo "Usage: just ci"
  @echo ""
  @echo "Runs the full CI pipeline: lint → vault check → test"

_ci-run:
  just dev lint all
  uv run vaultspec-core vault check all
  just dev test all

# ---------------------------------------------------------------------------
#  Internal recipes (prefixed with _ to hide from --list)
# ---------------------------------------------------------------------------
# clean - reclaim Class-A dev artifact sprawl (resource-hardening). Each line is
# a single cross-shell command (sh + pwsh). `cargo clean` drops the multi-GB
# engine target; `git worktree prune` clears administrative entries for removed
# worktrees; `git clean -fdX -- tmp` drops gitignored scratch under tmp/. NOTE:
# this does NOT delete the shared HuggingFace model cache (~/.cache/huggingface)
# — it belongs to other tools; scope it per-project with HF_HOME if needed. And
# it does NOT remove live agent worktrees under .claude/worktrees/ — remove
# those with `git worktree remove --force <path>` once their work is merged
# (the worktree teardown half of the policy).

_dev-clean:
  cargo clean --manifest-path engine/Cargo.toml
  git worktree prune -v
  git clean -fdX -- tmp
  @echo "reclaimed: engine/target, pruned worktree admin entries, tmp/ scratch"
  @echo "note: shared HF model cache and live agent worktrees are left intact (see recipe comment)"

# ---------------------------------------------------------------------------

_dev-deps target='--help':
  @{{ if target == "--help" { "just _dev-deps-help" } else if target == "-h" { "just _dev-deps-help" } else if target == "help" { "just _dev-deps-help" } else { "just _dev-deps-" + target } }}

_dev-deps-help:
  @echo "Usage: just dev deps <target>"
  @echo ""
  @echo "Targets:"
  @echo "  sync          Sync dependencies"
  @echo "  upgrade       Upgrade all dependencies"
  @echo "  lock          Lock dependencies"
  @echo "  lock-upgrade  Upgrade and lock dependencies"

_dev-deps-sync:
  uv sync --locked --group dev

_dev-deps-upgrade:
  uv sync --upgrade --all-groups

_dev-deps-lock:
  uv lock

_dev-deps-lock-upgrade:
  uv lock --upgrade

# ---------------------------------------------------------------------------

_dev-lint target='--help':
  @{{ if target == "--help" { "just _dev-lint-help" } else if target == "-h" { "just _dev-lint-help" } else if target == "help" { "just _dev-lint-help" } else { "just _dev-lint-" + target } }}

_dev-lint-help:
  @echo "Usage: just dev lint <target>"
  @echo ""
  @echo "Targets:"
  @echo "  toml      Run Taplo TOML linter"
  @echo "  markdown  Run Markdown linting and formatting checks"
  @echo "  rust      Run cargo fmt --check and clippy on the engine workspace"
  @echo "  frontend  Run eslint, prettier --check, and tsc on the SPA"
  @echo "  typos     Run repo-wide source spell check (typos)"
  @echo "  knip      Scan the SPA for unused files/exports/deps (advisory)"
  @echo "  all       Run all blocking linters (typos included; knip is advisory)"

_dev-lint-toml:
  @{{ if os() == "windows" { \
    "if (Get-Command taplo -ErrorAction SilentlyContinue) { taplo lint *.toml } elseif (Get-Command docker -ErrorAction SilentlyContinue) { docker run --rm -v '${PWD}:/repo' -w /repo tamasfe/taplo:0.9 lint *.toml } else { Write-Error 'taplo not found and docker is unavailable'; exit 127 }" \
  } else { \
    "if command -v taplo >/dev/null 2>&1; then taplo lint *.toml; elif command -v docker >/dev/null 2>&1; then docker run --rm -v \"$PWD:/repo\" -w /repo tamasfe/taplo:0.9 lint *.toml; else echo 'taplo not found and docker is unavailable' >&2; exit 127; fi" \
  } }}

_dev-lint-markdown:
  uv run mdformat --check README.md
  uv run pymarkdown --config .pymarkdown.json scan README.md

_dev-lint-rust:
  cargo fmt --manifest-path engine/Cargo.toml --all -- --check
  cargo clippy --manifest-path engine/Cargo.toml --workspace --all-targets -- -D warnings

_dev-lint-frontend:
  npm --prefix frontend run lint
  npm --prefix frontend run lint:px
  npm --prefix frontend run format:check
  npm --prefix frontend run typecheck
  npm --prefix frontend run tokens:check
  npm --prefix frontend run figma:names

# Regenerate the DTCG-derived color regions in styles.css and verify no drift.
_dev-tokens:
  npm --prefix frontend run tokens:build
  npm --prefix frontend run tokens:check

_dev-lint-typos:
  @{{ if os() == "windows" { \
    "if (Get-Command typos -ErrorAction SilentlyContinue) { typos } else { Write-Error 'typos not found - install with: cargo install typos-cli (or: mise install)'; exit 127 }" \
  } else { \
    "if command -v typos >/dev/null 2>&1; then typos; else echo 'typos not found - install with: cargo install typos-cli (or: mise install)' >&2; exit 127; fi" \
  } }}

# Advisory: reports unused files/exports/deps; not part of the blocking gate
# because just-built-but-not-yet-adopted exports are expected mid-build.
_dev-lint-knip:
  npx --yes knip@5 --directory frontend

_dev-lint-all:
  just _dev-lint-toml
  just _dev-lint-markdown
  just _dev-lint-rust
  just _dev-lint-frontend
  just _dev-lint-typos

# ---------------------------------------------------------------------------

_dev-fix target='--help':
  @{{ if target == "--help" { "just _dev-fix-help" } else if target == "-h" { "just _dev-fix-help" } else if target == "help" { "just _dev-fix-help" } else { "just _dev-fix-" + target } }}

_dev-fix-help:
  @echo "Usage: just dev fix <target>"
  @echo ""
  @echo "Targets:"
  @echo "  toml      Auto-format TOML files"
  @echo "  markdown  Auto-format Markdown files"
  @echo "  vault     Auto-fix vault issues"
  @echo "  rust      Auto-format the engine workspace (cargo fmt)"
  @echo "  frontend  Auto-format the SPA (prettier)"
  @echo "  all       Run all fixers"

_dev-fix-toml:
  @{{ if os() == "windows" { \
    "if (Get-Command taplo -ErrorAction SilentlyContinue) { taplo fmt *.toml } elseif (Get-Command docker -ErrorAction SilentlyContinue) { docker run --rm -v '${PWD}:/repo' -w /repo tamasfe/taplo:0.9 fmt *.toml } else { Write-Error 'taplo not found and docker is unavailable'; exit 127 }" \
  } else { \
    "if command -v taplo >/dev/null 2>&1; then taplo fmt *.toml; elif command -v docker >/dev/null 2>&1; then docker run --rm -v \"$PWD:/repo\" -w /repo tamasfe/taplo:0.9 fmt *.toml; else echo 'taplo not found and docker is unavailable' >&2; exit 127; fi" \
  } }}

_dev-fix-markdown:
  uv run mdformat README.md
  uv run pymarkdown --config .pymarkdown.json fix README.md

_dev-fix-vault:
  uv run vaultspec-core vault check all --fix
  uv run vaultspec-core vault sanitize annotations

_dev-fix-rust:
  cargo fmt --manifest-path engine/Cargo.toml --all

_dev-fix-frontend:
  npm --prefix frontend run format

_dev-fix-all:
  just _dev-fix-toml
  just _dev-fix-markdown
  just _dev-fix-vault
  just _dev-fix-rust
  just _dev-fix-frontend

# ---------------------------------------------------------------------------

_dev-audit target='--help':
  @{{ if target == "--help" { "just _dev-audit-help" } else if target == "-h" { "just _dev-audit-help" } else if target == "help" { "just _dev-audit-help" } else { "just _dev-audit-" + target } }}

_dev-audit-help:
  @echo "Usage: just dev audit <target>"
  @echo ""
  @echo "Targets:"
  @echo "  python    Run uv audit on locked Python dependencies"
  @echo "  rust      Run cargo-deny (advisories/licenses/bans/sources)"
  @echo "  node      Run npm audit on the SPA dependencies"
  @echo "  all       Run all supply-chain audits"

# The runtime (published-wheel) surface is the hard gate. Dev-group advisories
# are excluded because torch/vaultspec-rag are dev-only (published-wheel-purity)
# — torch is never imported or shipped (rag is consumed over loopback HTTP), so
# a torch.jit advisory cannot reach the wheel. Run plain `uv audit` to inspect
# the dev surface too.
_dev-audit-python:
  uv audit --no-dev --preview-features audit

_dev-audit-rust:
  @{{ if os() == "windows" { \
    "if (Get-Command cargo-deny -ErrorAction SilentlyContinue) { cargo deny --manifest-path engine/Cargo.toml check } else { Write-Error 'cargo-deny not found - install with: cargo install cargo-deny (or: mise install)'; exit 127 }" \
  } else { \
    "if command -v cargo-deny >/dev/null 2>&1; then cargo deny --manifest-path engine/Cargo.toml check; else echo 'cargo-deny not found - install with: cargo install cargo-deny (or: mise install)' >&2; exit 127; fi" \
  } }}

_dev-audit-node:
  npm --prefix frontend audit

_dev-audit-all:
  just _dev-audit-python
  just _dev-audit-rust
  just _dev-audit-node

# ---------------------------------------------------------------------------

_dev-test target='--help':
  @{{ if target == "--help" { "just _dev-test-help" } else if target == "-h" { "just _dev-test-help" } else if target == "help" { "just _dev-test-help" } else { "just _dev-test-" + target } }}

_dev-test-help:
  @echo "Usage: just dev test <target>"
  @echo ""
  @echo "Targets:"
  @echo "  rust      Run cargo test on the engine workspace (incl. e2e)"
  @echo "  bench     Run the cold-index benchmark with baseline output"
  @echo "  frontend  Run vitest on the SPA"
  @echo "  e2e       Install the browser + run Playwright e2e (needs the engine)"
  @echo "  all       Run all tests"

_dev-test-rust:
  cargo test --manifest-path engine/Cargo.toml --workspace

_dev-test-bench:
  @{{ if os() == "windows" { "$env:VAULTSPEC_BENCH_STRICT='1'; cargo test --manifest-path engine/Cargo.toml -p engine-e2e --test bench -- --nocapture" } else { "VAULTSPEC_BENCH_STRICT=1 cargo test --manifest-path engine/Cargo.toml -p engine-e2e --test bench -- --nocapture" } }}

_dev-test-frontend:
  npm --prefix frontend run test

# Browser e2e: provisions the Chromium binary (idempotent), then runs the
# Playwright smoke. Separate from `all` because it drives a live `vaultspec
# serve` origin and a real browser.
_dev-test-e2e:
  npm --prefix frontend exec -- playwright install chromium
  npm --prefix frontend run e2e

_dev-test-all:
  just _dev-test-rust
  just _dev-test-frontend

# ---------------------------------------------------------------------------

# Live development survey: one command starts the Vite SPA dev server, which in
# turn supervises the `vaultspec serve` engine. Chrome edits hot-reload (Vite
# HMR), `.vault/` corpus edits stream live (engine SSE), and engine source edits
# rebuild + restart the engine and force a browser refresh. Stale caches are
# cleared on boot. Override the engine port with VAULTSPEC_DEV_PORT and the
# engine handling with VAULTSPEC_DEV_ENGINE=manage|adopt|off.
_dev-serve:
  npm --prefix frontend run dev

# ---------------------------------------------------------------------------

_dev-build target='--help':
  @{{ if target == "--help" { "just _dev-build-help" } else if target == "-h" { "just _dev-build-help" } else if target == "help" { "just _dev-build-help" } else { "just _dev-build-" + target } }}

_dev-build-help:
  @echo "Usage: just dev build <target>"
  @echo ""
  @echo "Targets:"
  @echo "  rust      Build the engine workspace (release)"
  @echo "  frontend  Build the SPA production bundle"
  @echo "  all       Run all builds"

_dev-build-rust:
  cargo build --manifest-path engine/Cargo.toml --workspace --release

_dev-build-frontend:
  npm --prefix frontend run build

_dev-build-all:
  just _dev-build-rust
  just _dev-build-frontend

# ---------------------------------------------------------------------------

_dev-precommit target='--help':
  @{{ if target == "--help" { "just _dev-precommit-help" } else if target == "-h" { "just _dev-precommit-help" } else if target == "help" { "just _dev-precommit-help" } else { "just _dev-precommit-" + target } }}

_dev-precommit-help:
  @echo "Usage: just dev precommit <target>"
  @echo ""
  @echo "Targets:"
  @echo "  install   Install pre-commit hooks"
  @echo "  upgrade   Upgrade pre-commit hooks"
  @echo "  run       Run pre-commit hooks on all files"

_dev-precommit-install:
  uv run prek install

_dev-precommit-upgrade:
  uv run prek auto-update

_dev-precommit-run:
  uv run prek run --all-files
