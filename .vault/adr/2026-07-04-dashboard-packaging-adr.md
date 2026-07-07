---
tags:
  - '#adr'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-07'
related:
  - '[[2026-07-04-dashboard-packaging-research]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
---

# `dashboard-packaging` adr: `installable single-binary distribution and release pipeline` | (**status:** `accepted`)

## Problem Statement

The dashboard is not an installable product. The Rust engine (`vaultspec` binary from `engine/crates/vaultspec-cli`) and the TypeScript SPA (`frontend/dist`) build and dispatch separately in dev; no artifact-producing pipeline exists; the SPA reaches the binary only through an explicitly temporary filesystem passthrough (`engine/crates/vaultspec-api/src/routes/spa.rs`, self-marked as "bundling-time work"). The prior packaging decision — foundation ADR D9.2, per-platform Python wheels bundling the binary — was retired (`pyproject.toml` is now a `package = false` uv virtual project, commit `1c7c1f8ce`, 2026-06-30) without a successor, leaving distribution an open decision rather than a revision (F1). CI runs verification only, produces no artifacts, and carries an orphaned `release-please-config.json` still typed `python` for the dead wheel plus a dormant pre-commit CHANGELOG hook nothing feeds (F5). This ADR settles how the dashboard becomes a buildable, installable, updatable whole, under a hard zero-budget constraint on code signing.

## Considerations

- The product is one Rust binary plus one static, origin-relative SPA bundle that versions together with the engine; the SPA consumes only `import.meta.env.DEV` and is fully embedding-ready with no behavioral change (F1, F3).
- `serve` needs no Python runtime — user state and authoring are pure Rust over bundled SQLite. Python is reached only through two externally-provisioned sibling seams: the `vaultspec-core` CLI subprocess (floor `>=0.1.36`) and the optional attach-never-own `vaultspec-rag` HTTP service, which brings torch and is out-of-bundle per the resource-bounds wheel-purity rule (F1, F4).
- The startup/discovery contract is already product-shaped: loopback bind, fail-loud port conflict, `service.json` with heartbeat, CSPRNG bearer token injected into `index.html` (F2).
- The comparable single-static-binary cohort (atuin, jujutsu, gitui, zola, trunk) ships via GitHub Releases + install scripts + package managers; `dist` (formerly cargo-dist) is the maintained tool that generates that pipeline (v0.32.0, 2026-05-22) but carries medium-confidence vendor-continuity risk (F6).
- Zero budget for signing: Azure Trusted/Artifact Signing (~$120/yr) and Apple Developer Program ($99/yr) are both excluded by user constraint (D4).
- Existing verification jobs (`engine-ci.yml`, `quality-gates.yml`) are the gate a release must ride; the `tiers` envelope doctrine already governs honest per-component degradation (F5, D6).

## Considered options

- **Embed the SPA into the binary (rust-embed, behind a cargo feature) — CHOSEN for delivery.** One artifact, SPA and engine versioned together, matches the one-origin contract; costs binary size and couples UI fixes to a binary release.
- **Installed asset directory / keep disk passthrough for release — rejected.** Preserves independent UI shipping but reintroduces a two-artifact install, path resolution fragility, and version skew between engine and SPA.
- **`dist` (pinned) for release CI — CHOSEN for the pipeline.** Generates the GH Actions release matrix, shell/PowerShell installers, binstall metadata, Homebrew formula, MSI, npm installer, and axoupdater self-update from one config; medium-confidence continuity, mitigated by a pinned version and a documented fallback.
- **Owned GH Actions matrix + `cargo-wix` / `cargo-packager` — rejected as v1, retained as fallback.** Full control, no vendor risk, but hand-maintains cross-platform packaging that `dist` generates; `cargo-packager` (CrabNebula) makes installers but generates no CI.
- **Revive the Python wheel — rejected.** Already retired; orchestration lives in a co-resident Rust crate, not a Python launcher; `uv tool install` is the channel for the Python companions, not the binary.
- **Tauri v2 native shell — deferred (v3, not chosen).** Warranted only on explicit native-window demand; adds a second process model, webview quirks, and app-bundle signing for a loopback bearer-gated browser dashboard that needs none.
- **Paid code signing in v1 — rejected (zero budget).** Excluded; distribution leans on channels that accept unsigned artifacts.
- **Bundle `uv` and bootstrap Python tools on first run — deferred.** Zero-manual-step UX, but the product would own a Python toolchain lifecycle; revisit in v2 only if support cost demands it.
- **Detect-and-instruct for Python companions — CHOSEN.** Probe at startup, fail closed with the exact remediation command; no lifecycle ownership.
- **Hard version lockstep across components — rejected.** Brittle; replaced by floor-declaring handshake degrading honestly through `tiers`.
- **Keep release-please as-is — rejected.** Orphaned and mistyped `python`; retire it and let `dist` own releases.

## Constraints

- **`dist` vendor-continuity is medium-confidence** (one ambiguous parked-apex signal against a demonstrably active repo). Mitigate by pinning the `dist` version and keeping a documented, exercised fallback path (owned GH Actions matrix + `cargo-wix`, or `cargo-packager`); the release config must not float to `@latest`.
- **Unsigned binaries carry per-OS UX friction that must be documented honestly in install docs:** Windows SmartScreen "unrecognized app" warnings on the portable/zip and installers; macOS Gatekeeper blocking requiring right-click-open or `xattr -d com.apple.quarantine`. Linux is checksum-only and unaffected.
- **winget acceptance of an unsigned portable/zip manifest is unverified** — a frontier risk to validate in the plan before committing the winget channel. SignPath Foundation (free OSS signing) is an open follow-up path if the project qualifies, not a dependency of this decision.
- **rust-embed couples the SPA to the binary at compile time:** any UI fix requires a new binary release. Accepted as the cost of one-artifact delivery; dev retains the disk passthrough so iteration is not gated on rebuilds.
- **Detect-and-instruct depends on uv/PyPI availability** at the user's install time to satisfy the `vaultspec-core` remediation; offline installs will surface the floor failure without a local fix path until bundled-uv (v2) exists.
- **rag jurisdiction is the machine-singleton OS lock**, discovered via `~/.vaultspec-rag/service.json`; packaging never provisions, bundles, or owns rag, and must not set `VAULTSPEC_RAG_STATUS_DIR`.
- **Parent-feature stability:** the SPA embed rides an already-stable, origin-relative bundle (F3) and the mature startup/discovery contract (F2), so no unstable parent gates v1. The `uv-run` runner preference assumes a project venv; a packaged install outside the repo resolves `vaultspec-core` via PATH, which makes detect-and-instruct the binding provisioning path.

## Implementation

High-level layering only.

- **SPA embed.** Add a cargo feature (e.g. `embed-spa`) that compiles `frontend/dist` into the `vaultspec` binary via `rust-embed`. The `spa.rs` resolution chain becomes embedded-first for release builds: embedded assets → `VAULTSPEC_SPA_DIR` override → `<workspace_root>/frontend/dist` → placeholder page. Dev builds omit the feature and keep today's disk passthrough unchanged. The existing traversal guard, MIME handling, deep-link `index.html` fallback, `API_PREFIXES` boundary, and bearer-token `<meta>` injection are preserved verbatim, reading from the embedded store instead of disk. Release CI build order: frontend build → cargo build with the embed feature.
- **Release pipeline.** `dist init` generates `release.yml` over the target matrix, emitting shell + PowerShell installers, `cargo-binstall` metadata, checksums, and GitHub Releases upload; the `dist` version is pinned. The release job is gated on the existing `engine-ci.yml` and `quality-gates.yml` verification jobs — no artifact publishes without them green. CI toolchain is pinned to `engine/rust-toolchain.toml` (1.96.0) rather than `dtolnay/rust-toolchain@stable`, closing the reproducibility gap.
- **Startup provisioning probe.** At startup the engine probes `git` on PATH and `vaultspec-core` (capability probe + version floor `>=0.1.36`, reusing the existing `runner.rs` resolution). On failure it fails closed with the exact `uv tool install vaultspec-core` remediation string. rag stays attach-or-instruct: discovered via the machine singleton, degraded fail-closed when absent, never bundled or auto-provisioned. AMENDED (2026-07-07, CI evidence): "fails closed" is softened to WARN-loudly-and-serve-degraded — the exact remediation prints at startup and the affected tiers report unavailable, but serve never exits. The adversarial degradation suite and the conformance harness both run serve without core by design, and the binding tiers doctrine (degradation is honest, per component, read from the envelope) is the standing contract a startup exit would contradict.
- **Compatibility handshake.** A startup handshake declares component floors (`vaultspec-core >=0.1.36`; `vaultspec-rag >=0.2.28` when present), probing `vaultspec-core --version` + capability and rag `/health`. Results ride the existing `tiers` envelope: authoring verbs block on stale/absent core; semantic panels grey on absent/stale rag. Degradation is read from `tiers`, never inferred from a bare transport error, and never enforced as hard lockstep.
- **Update provenance.** `dist` installers write an install receipt; self-update (axoupdater) is offered only to copies whose receipt marks them self-installed. Package-manager-installed copies update through their manager. No auto-update; update is user-invoked or advisory.
- **Releaser cleanup.** Remove the orphaned `release-please-config.json` (typed `python` for the retired wheel) and let `dist`'s tag-driven flow own releases; versioning stays the single shared cargo workspace version bumped via conventional commits, with the changelog generated from those commits. Fix or remove the dormant pre-commit CHANGELOG hook (`.pre-commit-config.yaml`) accordingly. SUPERSEDED IN PART (2026-07-07): the no-releaser-in-front posture of this D7 row is amended by the release-automation ADR, which layers a correctly-typed, actually-invoked release-please release PR in front of the unchanged dist tag flow; the retirement of the ORPHANED python-typed config recorded here stands.

## Rationale

Embedding the SPA (F3: the bundle is self-contained, origin-relative, WASM/worker/public-free) makes the product the single static binary the comparable cohort ships (F6.1) and honors the one-origin startup contract (F2) — the artifact every distribution channel packages, not a competitor to them. `dist` is chosen because it generates that entire pipeline from one config and is actively maintained (F6.2, v0.32.0); its medium-confidence continuity is bounded by version pinning plus the documented owned-matrix / `cargo-packager` fallback, so the decision is reversible without re-architecting. Shipping unsigned (D4) is dictated by the zero-budget constraint and made viable by leaning on channels that accept unsigned artifacts — GitHub Releases + checksums, `cargo-binstall`, a Homebrew tap, and hash-pinned winget manifests (F6.4) — with the SmartScreen/Gatekeeper friction documented rather than hidden. Detect-and-instruct (F5/F6.5) matches that Python is externally provisioned (F4) and that a packaged install resolves `vaultspec-core` via PATH, deferring the heavier bundled-uv lifecycle until support cost justifies it. Provenance-aware update and the floor-declaring handshake (F6.6) reuse the existing `tiers`/fail-closed doctrine instead of inventing lockstep pinning, keeping component compatibility honest and per-panel. Retiring release-please (F5) removes dormant, mistyped config in favor of the releaser that now owns the flow. This ADR supersedes only the packaging posture of foundation-ADR D9.2 (the retired wheel row); the foundation ADR itself remains accepted and is not superseded as a whole.

## Consequences

- **End users on unsigned binaries** meet SmartScreen warnings (Windows) and Gatekeeper blocks (macOS, needing right-click-open or `xattr` removal); install docs must state both plainly. This is the accepted cost of zero-budget distribution and the friction SignPath Foundation could later remove.
- **Binary size grows** by the embedded SPA; this is the price of one-artifact delivery.
- **Release cadence now couples UI and engine:** any front-end fix requires a full binary release, and dev retains the disk passthrough precisely so day-to-day iteration is not gated on rebuilds.
- **A vendor dependency on `dist` is introduced**, mitigated by version pinning and a documented, exercised fallback; if `dist` stalls, the escape hatch is the owned GH Actions matrix (`cargo-wix`) or `cargo-packager`.
- **Provisioning UX depends on uv/PyPI reachability** at the user's install time; offline users see an honest floor failure but no local fix until bundled-uv lands.
- **Phasing.** v1 ships an unsigned installable single binary with the `dist` pipeline, detect-and-instruct probe, and releaser cleanup. v2 opens up broadened channels (winget/Homebrew/MSI/DMG), optional bundled-uv first-run bootstrap, the formalized handshake, optional SignPath signing, and Playwright e2e in the release gate. v3 (Tauri v2 native shell) is explicitly deferred, opened only on explicit native-shell demand — recorded as a path, not a commitment.
- **Open validation carried into the plan:** winget unsigned-manifest acceptance, and whether the project qualifies for SignPath Foundation OSS signing.
