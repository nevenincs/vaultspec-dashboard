set positional-arguments := false
set shell := ["sh", "-cu"]
set windows-shell := ["pwsh.exe", "-NoProfile", "-c"]



default:
  @echo "Available commands:"
  @echo "  prod [args...]    Run the vaultspec-dashboard Python CLI (pure 1:1 mirror)"
  @echo "  dev <target>      Development toolchain (deps, lint, fix, audit, test, build, etc.)"
  @echo "  ci                Full CI pipeline: lint → vault check → test"
  @echo ""
  @echo "Run 'just <command> --help' for more details."

# ===========================================================================
#  prod  - pure 1:1 mirror of the vaultspec-dashboard Python CLI
# ===========================================================================

prod *args='':
  @{{ if args == "--help" { "just _prod-help" } else if args == "-h" { "just _prod-help" } else if args == "help" { "just _prod-help" } else { "uv run vaultspec-dashboard " + args } }}

_prod-help:
  @echo "Usage: just prod [args...]"
  @echo ""
  @echo "Runs the vaultspec-dashboard Python CLI (pure 1:1 mirror)."

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
  @echo "  lint      read-only static analysis (ruff, ty, taplo, markdownlint, ...)"
  @echo "  fix       auto-fix everything fixable (python, toml, markdown, vault)"
  @echo "  audit     supply-chain / security checks (uv audit)"
  @echo "  test      pytest"
  @echo "  build     uv build"
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
  just prod vault check all
  just dev test all

# ---------------------------------------------------------------------------
#  Internal recipes (prefixed with _ to hide from --list)
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
  @echo "  python    Run Ruff on Python source"
  @echo "  type      Run Ty (type checker) on Python source"
  @echo "  toml      Run Taplo TOML linter"
  @echo "  markdown  Run Markdown linting and formatting checks"
  @echo "  rust      Run cargo fmt --check and clippy on the engine workspace"
  @echo "  frontend  Run eslint, prettier --check, and tsc on the SPA"
  @echo "  all       Run all linters"

_dev-lint-python:
  uv run ruff check src tests
  uv run ruff format --check src tests

_dev-lint-type:
  uv run python -m ty check src/vaultspec_dashboard

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
  npm --prefix frontend run format:check
  npm --prefix frontend run typecheck

_dev-lint-all:
  just _dev-lint-python
  just _dev-lint-type
  just _dev-lint-toml
  just _dev-lint-markdown
  just _dev-lint-rust
  just _dev-lint-frontend

# ---------------------------------------------------------------------------

_dev-fix target='--help':
  @{{ if target == "--help" { "just _dev-fix-help" } else if target == "-h" { "just _dev-fix-help" } else if target == "help" { "just _dev-fix-help" } else { "just _dev-fix-" + target } }}

_dev-fix-help:
  @echo "Usage: just dev fix <target>"
  @echo ""
  @echo "Targets:"
  @echo "  python    Auto-fix and format Python source"
  @echo "  toml      Auto-format TOML files"
  @echo "  markdown  Auto-format Markdown files"
  @echo "  vault     Auto-fix vault issues"
  @echo "  rust      Auto-format the engine workspace (cargo fmt)"
  @echo "  frontend  Auto-format the SPA (prettier)"
  @echo "  all       Run all fixers"

_dev-fix-python:
  uv run ruff format src tests
  uv run ruff check --fix src tests

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
  just _dev-fix-python
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
  @echo "  deps      Run uv audit on locked dependencies"

_dev-audit-deps:
  uv audit

# ---------------------------------------------------------------------------

_dev-test target='--help':
  @{{ if target == "--help" { "just _dev-test-help" } else if target == "-h" { "just _dev-test-help" } else if target == "help" { "just _dev-test-help" } else { "just _dev-test-" + target } }}

_dev-test-help:
  @echo "Usage: just dev test <target>"
  @echo ""
  @echo "Targets:"
  @echo "  python    Run pytest on Python source"
  @echo "  rust      Run cargo test on the engine workspace (incl. e2e)"
  @echo "  bench     Run the cold-index benchmark with baseline output"
  @echo "  frontend  Run vitest on the SPA"
  @echo "  all       Run all tests"

_dev-test-python:
  uv run pytest tests src/vaultspec_dashboard -x -q --tb=short -m "unit"

_dev-test-rust:
  cargo test --manifest-path engine/Cargo.toml --workspace

_dev-test-bench:
  @{{ if os() == "windows" { "$env:VAULTSPEC_BENCH_STRICT='1'; cargo test --manifest-path engine/Cargo.toml -p engine-e2e --test bench -- --nocapture" } else { "VAULTSPEC_BENCH_STRICT=1 cargo test --manifest-path engine/Cargo.toml -p engine-e2e --test bench -- --nocapture" } }}

_dev-test-frontend:
  npm --prefix frontend run test

_dev-test-all:
  just _dev-test-python
  just _dev-test-rust
  just _dev-test-frontend

# ---------------------------------------------------------------------------

_dev-build target='--help':
  @{{ if target == "--help" { "just _dev-build-help" } else if target == "-h" { "just _dev-build-help" } else if target == "help" { "just _dev-build-help" } else { "just _dev-build-" + target } }}

_dev-build-help:
  @echo "Usage: just dev build <target>"
  @echo ""
  @echo "Targets:"
  @echo "  python    Build Python package"
  @echo "  rust      Build the engine workspace (release)"
  @echo "  frontend  Build the SPA production bundle"
  @echo "  all       Run all builds"

_dev-build-python:
  uv build

_dev-build-rust:
  cargo build --manifest-path engine/Cargo.toml --workspace --release

_dev-build-frontend:
  npm --prefix frontend run build

_dev-build-all:
  just _dev-build-python
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
