# vaultspec-dashboard - unified UI for the vaultspec ecosystem

[![Python 3.13+](https://img.shields.io/badge/python-3.13%2B-blue.svg)](https://www.python.org/) [![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

vaultspec-dashboard is the visual companion to
[vaultspec-core](https://github.com/wgergely/vaultspec-core) and
[vaultspec-rag](https://github.com/wgergely/vaultspec-rag). It brings vault
health, document graphs, spec-driven workflow state, and semantic-search
activity from both siblings together behind a single user interface.

- **vaultspec-core** is the governed development framework that creates and
  manages a `.vault/` of markdown documents and the spec-driven workflow around
  them. It is a runtime dependency of the dashboard.
- **vaultspec-rag** is the GPU-accelerated semantic search companion. It is a
  development-only dependency here - it pulls a heavy CUDA torch backend, so it
  is consumed for local integration work and never shipped in the published
  wheel.

## Requirements

- Python 3.13 or newer
- [uv](https://docs.astral.sh/uv/getting-started/installation/) as the package
  manager
- A vaultspec-managed workspace (a `.vault/` directory created by
  vaultspec-core)

## Status

Early scaffold. The project structure, tooling, and vaultspec governance rules
are in place; the dashboard UI itself is not implemented yet.

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

## License

MIT - see [LICENSE](./LICENSE).
