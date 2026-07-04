# vaultspec-dashboard - unified UI for the vaultspec ecosystem

[![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue.svg)](https://www.python.org/) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

vaultspec-dashboard is the visual companion to
[vaultspec-core](https://github.com/nevenincs/vaultspec-core) and
[vaultspec-rag](https://github.com/nevenincs/vaultspec-rag). It brings vault
health, document graphs, spec-driven workflow state, and semantic-search
activity from both siblings together behind a single user interface.

- **vaultspec-core** is the governed development framework that creates and
  manages a `.vault/` of markdown documents and the spec-driven workflow around
  them. It is a runtime dependency of the dashboard.
- **vaultspec-rag** is the GPU-accelerated semantic search companion. It is a
  development-only dependency here - it pulls a heavy CUDA torch backend, so it
  is consumed for local integration work and never shipped in the published
  wheel.

## Install

The dashboard ships as a single `vaultspec` executable with the web UI built
in - install it, run `vaultspec serve` inside a vaultspec-managed workspace,
and open the printed local address in your browser.

Download from [GitHub Releases](https://github.com/nevenincs/vaultspec-dashboard/releases),
or use one of the installers:

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/vaultspec-cli-installer.sh | sh
```

```powershell
# Windows
powershell -ExecutionPolicy Bypass -c "irm https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/vaultspec-cli-installer.ps1 | iex"
```

Every release asset ships with a `.sha256` checksum file; verify downloads
with `sha256sum -c <asset>.sha256`.

Installer-installed copies can update themselves with `vaultspec-cli-update`
(updates are always user-invoked, never automatic). Copies installed through a
package manager update through that package manager instead.

### Unsigned binaries

Release binaries are not code-signed (this is a zero-budget open-source
project), so the first launch trips OS gatekeeping:

- **Windows**: SmartScreen shows "Windows protected your PC" - choose
  "More info" then "Run anyway". Verify the checksum first if in doubt.
- **macOS**: Gatekeeper blocks the first run - right-click the binary and
  choose "Open", or clear the quarantine flag with
  `xattr -d com.apple.quarantine <path-to-vaultspec>`.
- **Linux**: no signing regime; verify the checksum.

### Runtime requirements

- `git` on `PATH`
- [vaultspec-core](https://github.com/nevenincs/vaultspec-core) 0.1.36 or
  newer: `uv tool install vaultspec-core` (the dashboard checks at startup and
  prints this exact command when it is missing)
- Optional: [vaultspec-rag](https://github.com/nevenincs/vaultspec-rag) for
  semantic search - the dashboard attaches to a running rag service and
  degrades the semantic panels gracefully when it is absent
- A vaultspec-managed workspace (a `.vault/` directory created by
  vaultspec-core)

### Releasing (maintainers)

Releases are cut by tagging a green `main` commit with the workspace version
(e.g. `v0.1.0`); the tag triggers the `release.yml` workflow, which builds
every target with the web UI embedded, and publishes archives, checksums, and
installers to GitHub Releases. The verification workflows gate merges to
`main`, so only verified commits are taggable in practice.

## Status

In development, not yet released. The project structure, tooling, and
vaultspec governance rules are in place and the dashboard UI is taking shape;
interfaces and commands may change without notice.

## Development

```bash
uv sync --all-groups          # install the uv dev toolchain (vaultspec-core, rag, ...)
just dev lint all             # taplo, markdown, clippy, eslint, prettier, tsc
just dev test all             # cargo test + vitest
just ci                       # full pipeline: lint -> audit -> vault check -> test
```

The dev dependency group includes vaultspec-rag, which installs a CUDA torch
build from the `pytorch-cu130` index. Omit it with `uv sync` (no
`--all-groups`) if you only need the runtime surface.

## The vaultspec family

vaultspec-dashboard is the visual layer of the vaultspec family - a set of
tools built around one shared vault:

- [vaultspec-core](https://github.com/nevenincs/vaultspec-core) - the hub: the
  `Research → Decide → Plan → Code → Review` pipeline, the git-tracked
  Markdown vault, and the CLI that drives them.
- [vaultspec-rag](https://github.com/nevenincs/vaultspec-rag) - semantic
  search across the vault and the codebase.
- vaultspec-a2a - agent-to-agent orchestration across your coding agents.
  Early.

## License

MIT - see [LICENSE](./LICENSE).
