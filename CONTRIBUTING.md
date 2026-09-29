# Contributing to vaultspec-dashboard

These instructions apply to a source checkout. They don't install a published release.

Install the toolchain and dependencies, then start the development servers:

```console
mise install
just init
just dev
```

`just init` provisions everything a fresh worktree needs — the locked Python
toolchain, the SPA's `node_modules`, the framework enrollment, the git hooks,
and `.env`. It is safe to run again at any time and costs nothing when there is
nothing to do. `just init-check` reports whether a worktree is ready without
changing anything.

`just dev` runs the machine-wide dev-server harness (`dev/devserver.py`, shared by
every web app on this workstation). It starts the SPA dev server — which builds and
supervises the engine — or reattaches to the one this checkout already runs, frees its
ports of any other worktree's servers, and prints the URLs
(`https://vaultspec-dashboard.localhost` through portless). The ports are declared once,
in the `devserver` block of [`frontend/package.json`](frontend/package.json). Other
targets: `just dev status`, `just dev logs`, `just dev restart`, `just dev stop all`,
and `just dev up review` for the visual review desk. `just dev check` is the static
conformance gate the Dev server workflow runs.

Run the relevant quality checks before submitting changes:

```console
just ci
just test-e2e
```

`just ci` runs lint and vault checks, the Rust and Vitest suites, and repository guards.
Browser end-to-end tests run separately with `just test-e2e`.

Build the Dashboard binary with the web interface embedded:

```console
just build-package
```

This does not build the updater or manifests needed for a complete release installation.

Use [`mise.toml`](mise.toml) and the [`justfile`](justfile) as the authoritative task
definitions. For design work, use:

- [Figma workflow](frontend/figma/FIGMA-WORKFLOW.md)
- [Design-system contract](frontend/figma/DESIGN-SYSTEM.md)
- [Figma workspace guide](frontend/figma/README.md)
- [Token guide](frontend/tokens/README.md)

Read the [current-main application lifecycle](docs/application-runtime.md) when working on
unreleased launch, update, or single-instance behavior.

Release automation lives in the
[Release Please workflow](.github/workflows/release-please.yml) and
[distribution workflow](.github/workflows/release.yml). Use conventional commits and let
Release Please update the [engine changelog](engine/CHANGELOG.md).

Regenerate terminal README assets with:

```console
just docs-readme-assets
```

To regenerate application captures, start the dev server with `just dev`, then run the
capture task:

```console
npm --prefix frontend run readme:capture
```

The capture task generates the README figures and their manifest.
