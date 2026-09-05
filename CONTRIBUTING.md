# Contributing to vaultspec-dashboard

These instructions apply to a source checkout. They don't install a published release.

Install the toolchain and dependencies, then start the development servers:

```console
mise install
just bootstrap
npm --prefix frontend ci
just serve
```

Run the relevant quality checks before submitting changes:

```console
just ci
just test e2e
```

`just ci` runs lint and vault checks, the Rust and Vitest suites, and repository guards.
Browser end-to-end tests run separately with `just test e2e`.

Build the Dashboard binary with the web interface embedded:

```console
just build package
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
just docs readme-assets
```

To regenerate application captures, keep `just serve` running in one terminal. Run the
capture task in another:

```console
npm --prefix frontend run readme:capture
```

The capture task generates the README figures and their manifest.
