---
tags:
  - '#research'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-06-12-dashboard-foundation-research]]'
  - '[[2026-06-14-user-state-persistence-adr]]'
  - '[[2026-06-26-rag-service-management-reference]]'
---

# `dashboard-packaging` research: `packaging, distribution, and release pipeline`

The dashboard today is not an installable product: the Rust engine and the TypeScript
SPA are built and dispatched separately in dev, no artifact-producing pipeline exists,
and the old "Python wheel bundles the binary" packaging decision (foundation ADR D9.2)
was retired without a successor. This research maps the current build/serve/provisioning
reality, the external option space as of mid-2026, and the decision points a packaging
ADR must settle, so the dashboard can become a buildable, installable, updatable whole.

## Findings

### F1 — What the product actually is, and the retired-wheel history

The shipped surface is one Rust binary plus one static SPA bundle:

- The cargo workspace produces exactly one binary: `vaultspec`, from
  `engine/crates/vaultspec-cli` (`engine/Cargo.toml:3`, bin decl at
  `engine/crates/vaultspec-cli/Cargo.toml:10-12`). CLI verbs: `map`, `index`, `graph`,
  `node`, `events`, `status`, and the resident `serve` mode
  (`engine/crates/vaultspec-cli/src/main.rs:39-96`), with global `--json` and
  `--scope <WORKTREE>`; `serve` takes `--port` (default 8767,
  `engine/crates/vaultspec-api/src/lib.rs:34`).
- The Python wheel is gone. D9.2 ("per-platform wheels bundle the binary; Python package
  is locator/launcher", foundation ADR) was undercut by the user-state-persistence ADR
  (orchestration placed in a co-resident Rust crate, not a Python launcher), the package
  source was deleted (commit `9e87a3b0f6`), and commit
  `1c7c1f8ceadbfb19ad2e499a97e8e4057bbfb7ac` (2026-06-30) formally retired the wheel:
  `pyproject.toml` is now a uv virtual project (`[tool.uv] package = false`), dev
  tooling only, never built or published. Distribution model is therefore an open
  decision, not a revision of D9.2.
- `serve` needs no Python runtime. `vaultspec-session` (user state) and the `authoring`
  module are pure Rust over bundled-SQLite `rusqlite`
  (`engine/crates/engine-store/Cargo.toml:13`,
  `engine/crates/vaultspec-api/src/authoring/store/mod.rs:20-24`). Python is reached
  only through two externally-provisioned sibling seams: the `vaultspec-core` CLI
  subprocess and the `vaultspec-rag` HTTP service (F4).

### F2 — How the binary delivers the SPA today: an explicitly temporary passthrough

SPA serving is filesystem passthrough, and the code itself marks embedding as deferred
packaging work: `engine/crates/vaultspec-api/src/routes/spa.rs:1-4` reads "filesystem-dir
serving (the dev passthrough; asset embedding is bundling-time work under D9.2's
deferred mechanics)".

- `spa_dir()` (`spa.rs:17-24`) resolves `VAULTSPEC_SPA_DIR` env override, else
  `<workspace_root>/frontend/dist`, else `None` → a hardcoded placeholder page telling
  the operator to run the frontend build (`spa.rs:41-44`).
- The catch-all `spa_fallback` (`spa.rs:130-181`) does traversal-guarded file lookup,
  correct MIME (incl. `wasm`, `woff2`), deep-link fallback to `index.html`, and a hard
  `API_PREFIXES` boundary so unknown API paths 404 as JSON.
- Auth: the engine injects the bearer token into served `index.html` as
  `<meta name="vaultspec-token">` (`spa.rs:46-68`); the SPA never reads `service.json`.
- There is no compile-time coupling: the Rust binary builds without `frontend/dist`;
  build order only matters for what `serve` finds on disk (`justfile:303-311`).
- Startup/discovery contract is already product-shaped: loopback-only bind, fail-loud
  port conflict, `--port 0` ephemeral support, `service.json`
  (port/token/pid/heartbeat, 15 s heartbeat, `0600` on Unix) under
  `.vault/data/engine-data/` (`engine/crates/vaultspec-api/src/lib.rs:443-475`,
  `app.rs:1531-1553`), 128-bit CSPRNG bearer token constant-time-compared
  (`app.rs:1572-1587`, `app.rs:1397-1431`), crash log at
  `<engine-data>/crash.log` (`lib.rs:352-372`).

### F3 — The frontend bundle is embedding-ready

The production SPA is fully self-contained and origin-relative, i.e. it can be baked
into the binary with no behavioral change:

- `vite build` (via `tsc -b && vite build`, `frontend/package.json:11`) emits default
  `dist/`, base path `/`, vendor-split chunks (`frontend/vite.config.ts:34-64`).
- The only env consumed is `import.meta.env.DEV`: `API_BASE = DEV ? "/api" : ""`
  (`frontend/src/stores/server/engine.ts:42`) — production is pure same-origin relative
  fetch; no `VITE_*` vars, no hardcoded origin.
- No `frontend/public/`, no WASM, no workers, no runtime-fetched fonts; icons are
  SVG-in-JS; three.js runs on the main thread. Nothing needs special asset handling.
- Toolchain: npm 11.5.2 (`packageManager`), Node `^20.19.0 || >=22.12.0`
  (`frontend/package.json:64-66`), Node 22 pinned in `mise.toml:12`; no native
  postinstall deps anywhere in `frontend/package.json`.

### F4 — The provisioning surface an installer must satisfy

Beyond its own binary + SPA, a running install needs exactly:

- **`git` on PATH** — only for the read-only `/ops/git/*` pass-through
  (`engine/crates/vaultspec-api/src/routes/ops.rs:571`, `ops.rs:608-610`,
  bounded runner `ops.rs:842-917`). Graph construction itself is pure-Rust `gix`
  (foundation ADR D2.5; `engine/crates/ingest-git/src/workspace.rs:1-46`). No version
  floor is enforced today.
- **`vaultspec-core >= 0.1.36`** (pin at `pyproject.toml:4`) as a bounded subprocess.
  Resolution (`engine/crates/ingest-core/src/runner.rs:392-405`) prefers
  `uv run --no-sync vaultspec-core` over bare PATH, capability-probes the write verbs
  (`runner.rs:351-383`), and version-gates features (`runner.rs:414-438`). Every spawn
  carries a stdout cap (64 MiB default) and wall-clock timeout (120 s default)
  (`runner.rs:34-77`). Note: the uv-run preference assumes a project venv — a packaged
  install outside this repo will resolve via PATH, which makes the detect-and-instruct
  UX (F6.5) the binding path.
- **`vaultspec-rag` — optional, attach-never-own.** Machine singleton discovered via
  `~/.vaultspec-rag/service.json` + heartbeat + ungated `/health` ready
  (`engine/crates/rag-client/src/client.rs:430-450`; contract in the rag service
  management reference). Lifecycle verbs proxied through the bounded sibling runner
  (`ops.rs:2385-2395`, `ops.rs:919-935`). The dashboard degrades gracefully when rag is
  absent (foundation research, scope boundaries). rag brings Python + torch and is
  unambiguously out-of-bundle per the resource-bounds wheel-purity rule.
- **State it creates:** per-workspace `.vault/data/engine-data/` (`service.json`,
  re-derivable `engine.sqlite3`, non-re-derivable `user-state.sqlite3`) and
  `.vault/data/authoring-state/authoring-state.sqlite3` (durable, schema v8); the only
  machine-global state is rag's own `~/.vaultspec-rag/`.
- **Anomaly flagged:** the current working tree adds `vaultspec-rag[mcp]>=0.2.28` to
  runtime `[project.dependencies]` in `pyproject.toml` — uncommitted, coexisting with
  the dev-group `vaultspec-rag>=0.2.25` pin. With `package = false` it never publishes,
  but it changes the default `uv sync` set and matches the known rag-installer drift
  pattern; intent should be confirmed before commit.

### F5 — Release/CI infrastructure: verification-only, with an orphaned releaser

- Two workflows exist, neither produces artifacts: `engine-ci.yml` (fmt/clippy/build/
  test on ubuntu+windows matrix, installs `vaultspec-core` via `uv tool install` for
  e2e) and `quality-gates.yml` (typos; frontend lint+vitest ONLINE against a real
  built `vaultspec serve`; live engine-conformance job; supply-chain: cargo-deny,
  `uv audit --no-dev`, `npm audit`). No tag, no upload, no publish anywhere.
- `release-please-config.json` still declares `release-type: python` for the retired
  wheel, and **nothing invokes release-please at all** — no workflow step, no manifest,
  no `CHANGELOG.md`; only a pre-commit hook assumes it exists
  (`.pre-commit-config.yaml:56-65`). It is dormant/orphaned config.
- Reproducibility gaps: CI uses `dtolnay/rust-toolchain@stable` while the repo pins
  1.96.0 in `engine/rust-toolchain.toml` (rustup honors the file only if the working
  directory triggers override detection); `just ci` references an undefined
  `just prod` namespace (`justfile:48-51`); local `dev build` recipes
  (`justfile:303-311`) build release binaries + bundle but package nothing.
- Release hygiene already present: single shared workspace version 0.1.0, MIT,
  `unsafe_code = "forbid"`, mature `engine/deny.toml`, `Cargo.lock` + `uv.lock`
  committed, mise pins (just/node 22/python 3.13/uv). No cargo-dist/cargo-release/
  cargo-packager config exists.
- Tests that would gate a release: the two workflows above; Playwright e2e and strict
  bench exist locally but are not in CI.

### F6 — Option space (verified mid-2026)

1. **Single self-contained binary (embed the SPA).** `rust-embed` (or `include_dir`)
   over `frontend/dist` at compile time; axum serves from memory; launch = run binary,
   open browser. This is how the comparable cohort ships (atuin, jujutsu, gitui, zola,
   trunk: single static binary via GitHub Releases + install scripts + package
   managers). Low effort; the SPA and engine version together, which matches the
   one-origin contract. This is the artifact every other option packages, not a
   competitor to them.
2. **`dist` (formerly cargo-dist) for release CI.** Alive and maintained (v0.32.0,
   2026-05-22; active tracker under `github.com/axodotdev/cargo-dist`). `dist init`
   generates the GitHub Actions release pipeline over a target matrix and emits shell +
   PowerShell installers, MSI, Homebrew formula, npm installer, `cargo-binstall`
   metadata, and self-update via axoupdater. Vendor continuity is medium-confidence
   (one ambiguous parked-apex signal; repo demonstrably active) — pin the version and
   keep a documented fallback. Fallbacks: `cargo-packager` (CrabNebula; installers but
   no CI generation) or a hand-rolled GH Actions matrix + `cargo-wix`.
3. **Tauri v2 desktop shell: defer.** Sidecar + webview + updater plugin is warranted
   only if a native app window becomes a requirement; for a loopback bearer-gated
   browser dashboard it adds a second process model, webview quirks, and app-bundle
   signing for no current need.
4. **Channels by audience:** `cargo-binstall` (~free, dist emits it), Homebrew tap
   (free, dist generates), winget (free PR, wants a signed installer), npm wrapper
   (optional reach). `uv tool install` is not a channel for the binary (that was the
   retired wheel) — it is the channel for the Python companions.
   Signing: Windows via Azure Trusted/Artifact Signing (~$120/yr, individual-dev
   preview US/Canada) or SignPath Foundation (free for qualifying OSS); macOS Apple
   Developer $99/yr incl. notarization; Linux checksums only.
5. **Python companion policy.** v1: detect-and-instruct — probe PATH + version floor at
   startup, fail closed with the exact `uv tool install vaultspec-core` command.
   v2 option: bundle the tiny static `uv` binary and bootstrap app-scoped tools on
   first run (zero-manual-step UX at the cost of owning a Python toolchain lifecycle).
   rag stays attach-or-instruct, degrade fail-closed, never auto-provisioned (torch).
6. **Update story.** Self-update (axoupdater) only for self-installed copies, decided
   by an install-provenance receipt; package-manager-owned updates elsewhere. The real
   contract is cross-component compatibility: a startup handshake declaring floors and
   probing `vaultspec-core --version` + rag `/health`, degrading honestly per component
   (block authoring on stale core, grey semantic panels on absent rag) — this rides the
   existing `tiers`/fail-closed doctrine rather than inventing lockstep pinning.

### F7 — Recommended shape (phased)

- **v1 — make it a product:** embed `frontend/dist` in the binary behind a build flag
  (keep the disk passthrough for dev), add a `dist`-generated release workflow gated on
  the existing verification jobs (shell/pwsh installers + binstall + GH Releases),
  re-point or retire release-please, pin the CI toolchain to `rust-toolchain.toml`,
  add the startup detect-and-instruct probe for git/vaultspec-core and the rag
  attach-or-instruct path, and a `--open`/first-run browser launch. Ship unsigned to
  the early dev audience.
- **v2 — harden and broaden:** signing (Azure Artifact Signing or SignPath; Apple
  notarization) → winget + Homebrew tap + MSI/DMG; optional bundled-uv first-run
  bootstrap; formalize the compatibility handshake; add Playwright e2e to the release
  gate.
- **v3 — only on explicit demand:** Tauri v2 native shell with the engine as sidecar.

### Open decision points for the ADR

- D1: distribution engine — `dist` (pinned, with documented fallback) vs owned GH
  Actions matrix.
- D2: SPA delivery in release builds — compile-time embed (recommended) vs installed
  asset dir; and whether dev keeps the passthrough.
- D3: Python companion policy — detect-and-instruct vs bundled-uv bootstrap; how much
  Python lifecycle the product owns.
- D4: signing spend/timing — unsigned v1 acceptable? which Windows signing path, given
  maintainer jurisdiction (individual-dev preview is US/Canada today).
- D5: update ownership — provenance-aware self-update vs manager-only.
- D6: compatibility gating — exact floors and the degrade-vs-block matrix for core/rag,
  expressed through the existing `tiers` seam.
- D7: release-please disposition — re-type for the Rust binary vs retire in favor of
  dist's flow; fix the dormant pre-commit CHANGELOG hook either way.

### Sources

- Code: `engine/Cargo.toml`, `engine/crates/vaultspec-cli/src/main.rs`,
  `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-api/src/routes/spa.rs`,
  `engine/crates/vaultspec-api/src/app.rs`, `engine/crates/vaultspec-api/src/routes/ops.rs`,
  `engine/crates/ingest-core/src/runner.rs`, `engine/crates/rag-client/src/client.rs`,
  `engine/crates/engine-store/src/lib.rs`, `frontend/vite.config.ts`,
  `frontend/src/stores/server/engine.ts`, `frontend/dev-ports.ts`, `justfile`,
  `mise.toml`, `pyproject.toml`, `release-please-config.json`,
  `.github/workflows/engine-ci.yml`, `.github/workflows/quality-gates.yml`,
  `engine/rust-toolchain.toml`, `engine/deny.toml`.
- Git: commits `9e87a3b0f6` (package deletion), `1c7c1f8ceadbfb19ad2e499a97e8e4057bbfb7ac`
  (wheel retirement, 2026-06-30).
- External: github.com/axodotdev/cargo-dist (dist v0.32.0, 2026-05-22);
  axodotdev.github.io/cargo-dist/; github.com/crabnebula-dev/cargo-packager;
  github.com/cargo-bins/cargo-binstall; crates.io/crates/rust-embed;
  v2.tauri.app/develop/sidecar/ and v2.tauri.app/plugin/updater/;
  docs.astral.sh/uv/concepts/tools/;
  azure.microsoft.com/en-us/pricing/details/artifact-signing/;
  developer.apple.com/documentation/security/notarizing-macos-software-before-distribution;
  signpath.org (SignPath Foundation OSS signing).
