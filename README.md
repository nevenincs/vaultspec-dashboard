<img src="docs/assets/logo.png" width="150" alt="vaultspec-dashboard logo">

# vaultspec-dashboard

The human-facing visual workspace for a Vaultspec project.

Browse feature records, source files, and Git history in a local web interface.
Choose a project and worktree, follow relationships in the graph, and read or edit
vault Markdown alongside your code.

[![quality](https://img.shields.io/github/actions/workflow/status/nevenincs/vaultspec-dashboard/quality-gates.yml?branch=main&style=flat&label=quality&logo=githubactions&logoColor=white&labelColor=24292f)](https://github.com/nevenincs/vaultspec-dashboard/actions/workflows/quality-gates.yml)
[![release](https://img.shields.io/github/v/release/nevenincs/vaultspec-dashboard?style=flat&label=release&logo=github&logoColor=white&labelColor=24292f&color=8A72B5)](https://github.com/nevenincs/vaultspec-dashboard/releases/latest)
[![targets](https://img.shields.io/badge/targets-macOS%20arm64%20%7C%20Linux%20arm64%2Fx64%20%7C%20Windows%20x64-3F9AA6?style=flat&labelColor=24292f)](https://github.com/nevenincs/vaultspec-dashboard/releases/latest)
[![license](https://img.shields.io/github/license/nevenincs/vaultspec-dashboard?style=flat&label=license&logo=opensourceinitiative&logoColor=white&labelColor=24292f&color=B3823C)](LICENSE)

[Visual tour](#visual-tour) ·
[Getting started](#getting-started) · [Capabilities](#capabilities) ·
[Vaultspec family](#vaultspec-family) · [Documentation](#documentation) ·
[Status](#status-and-license)

![Complete Vaultspec workspace showing the project and worktree selector, Vault and Files navigation, populated graph, timeline, and activity](docs/assets/workspace.png)

## Visual tour

![Markdown decision document open within its vault and repository context beside the populated graph](docs/assets/document-workspace.png)

*Open a document from **Documents** > **Decisions** without losing its workspace and
graph context.*

![Search documents and code dialog with All, Docs, and Code scopes, a real query, and populated repository results](docs/assets/search.png)

*Search documents and code with a real query, scoped result controls, and populated results.*

![Activity and status view showing open plans and the running search service](docs/assets/status.png)

*Review current open plans and search-service state from the running workspace.*

<p id="project-layout"></p>
<p id="project-responsibilities"></p>
<p id="installed-runtime"></p>

## Getting started

### Prerequisites and installation

Supported platforms:

- macOS on Apple silicon
- Linux on arm64, glibc 2.28 or newer
- Linux on x64, glibc 2.28 or newer
- Windows on x64

Intel Macs aren't supported. Use Bash on macOS and Linux, or PowerShell 5.1 or
newer on Windows.

The installers download the [latest release](https://github.com/nevenincs/vaultspec-dashboard/releases/latest),
check the archive's SHA-256 checksum, and run `vaultspec verify-release` on the
installed files.

On macOS or Linux:

```bash
curl -fsSL https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/install.sh | bash
```

On Windows:

```powershell
& ([scriptblock]::Create((irm https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/install.ps1)))
```

The scripts don't change `PATH`. To run `vaultspec` by name in the current
terminal, add its binary directory.

On macOS or Linux:

```bash
export PATH="$HOME/.local/share/vaultspec/bin:$PATH"
```

On Windows:

```powershell
Set-Item Env:Path "$env:LOCALAPPDATA\Programs\vaultspec\bin;$env:Path"
```

Repeat this step in each new terminal. Confirm the installation:

```console
vaultspec --version
```

`cargo install` and `cargo binstall` aren't supported: they don't install all
required runtime files.

Release binaries are unsigned. Your operating system may warn before running them.

Agent-to-agent orchestration isn't available in v0.1.12.

### Updating

In v0.1.12, `vaultspec update` doesn't download a newer release. The installers
also refuse to overwrite an existing installation. These commands don't provide
an in-place upgrade. Consult the target version's
[release notes](https://github.com/nevenincs/vaultspec-dashboard/releases)
for upgrade instructions.

<p id="removing-it-and-what-stays"></p>

### Uninstall

The installation commands don't save the scripts. Download
[install.sh](https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/install.sh)
or [install.ps1](https://github.com/nevenincs/vaultspec-dashboard/releases/latest/download/install.ps1),
then run the saved script from its directory.

On macOS or Linux:

```bash
bash ./install.sh --uninstall
```

On Windows:

```powershell
.\install.ps1 -Uninstall
```

For a custom installation, pass its directory with `--install-dir` or
`-InstallDir`. If removal is refused, the script leaves the installation in place.
The script doesn't delete your project files or per-user application data.

### Prepare a project

Use a Git repository. Vault validation and authoring require vaultspec-core 0.1.34
or later, installed separately:

```console
uv tool install 'vaultspec-core>=0.1.34'
```

From the repository root, create the vault structure if the project does not already
use Vaultspec:

```console
vaultspec-core install core
```

This writes the vault structure and project policy. For coding-agent setup too, follow
the [core installation guide](https://github.com/nevenincs/vaultspec-core#install).
Inspect the project's records with:

```console
vaultspec-core status
```

A new vault has no records. [Start a feature](https://github.com/nevenincs/vaultspec-core#start-a-feature)
to create some, or open an existing project's vault for the walkthrough below.

### Start the dashboard

From the managed Git worktree, run:

```console
vaultspec serve
```

Keep the terminal open. When the service is ready, it prints:

```text
vaultspec serve: listening on http://127.0.0.1:8767 (bearer token in service.json)
```

Open `http://127.0.0.1:8767` in your browser. A successful dashboard shows the current
worktree selector, **Vault/Files** browser, populated graph, timeline, and activity rail.
The [complete workspace capture](#vaultspec-dashboard) shows this result.

### Optional semantic search

Install [vaultspec-rag](https://github.com/nevenincs/vaultspec-rag#install), then
[start its service and index your repository](https://github.com/nevenincs/vaultspec-rag#use-it).
The RAG guide lists the supported GPUs, Python versions, and installation routes.

The dashboard connects to the machine-wide RAG service. Wait for indexing to finish
before searching by meaning. Stopping that service also affects its other clients.

Without RAG, search still matches document titles and file names. Browsing, the graph,
and Git history remain available.

### Follow one record from vault to search

1. Select your project and worktree in the location selector.
1. Expand **Vault > Documents > Decisions** and select a record. The graph highlights
   the same selection.
1. Double-click the record, or press **Enter**, to open its title, properties, and
   Markdown body in the reader. **Edit** appears when authoring is available.
1. Open **Search documents and code** with **Command+Option+S** on macOS or
   **Ctrl+Alt+S** on Windows and Linux. These are the default bindings; use your
   configured shortcut if you changed them.
1. Choose **Docs**, enter part of the record's title, and press **Enter** on a result
   to open it.

## Capabilities

- Browse registered projects and worktrees, then open a project's `.vault/` feature records or code.
- Explore separate vault and code graph views in desktop layouts. Compact and mobile layouts omit the graph.
- Read source files in read-only views. Edit vault Markdown through Core.
- Search documents and code, with optional semantic search through RAG.
- Track plans, commits, issues, and pull requests.

### When a capability is unavailable

Views report unavailable data sources. If Core is missing, [prepare a project](#prepare-a-project).
For missing RAG, follow [optional semantic search](#optional-semantic-search).

## Vaultspec family

- [vaultspec-core](https://github.com/nevenincs/vaultspec-core): Decision-driven harness for coding agents, and humans.
- [vaultspec-rag](https://github.com/nevenincs/vaultspec-rag): The semantic search component for vault and code.
- [vaultspec-a2a](https://github.com/nevenincs/vaultspec-a2a): Headless agent-to-agent orchestration for Vaultspec.

<p id="glossary"></p>

## Documentation

- [Follow the feature workflow](https://github.com/nevenincs/vaultspec-core/blob/main/docs/framework.md).
- [Check your Core setup](https://github.com/nevenincs/vaultspec-core/blob/main/docs/verification.md).
- [Search and index with RAG](https://github.com/nevenincs/vaultspec-rag/blob/main/docs/search-and-index.md).
- [Troubleshoot the RAG service](https://github.com/nevenincs/vaultspec-rag/blob/main/docs/service-mode.md#troubleshooting).
- [Read the release notes](engine/CHANGELOG.md).

## Status and license

Dashboard is in beta. [Report bugs or request features](https://github.com/nevenincs/vaultspec-dashboard/issues).

For bug reports, include the output of `vaultspec --version`, your OS, installation
method, steps to reproduce, and the relevant error or screenshot.

When relevant, add the command, working directory, selected worktree or `--scope`,
and `vaultspec --json status` output. Include RAG health information for semantic
search problems.

Redact credentials, private paths, and private content before posting.

Licensed under [MIT](LICENSE).

## Contributing

See the [contributor guide](CONTRIBUTING.md) to build from source, run tests, work on
the design, prepare releases, or update screenshots.
