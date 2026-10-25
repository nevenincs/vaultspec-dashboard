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

## Releasing

Use conventional commit messages such as `feat:`, `fix:`, and `feat!:`.
[Release Please](.github/workflows/release-please.yml) maintains a release pull request
with the next version and the [engine changelog](engine/CHANGELOG.md), rebuilt on every
commit that lands on `main`. Merging it does not release anything.

To release, dispatch `Dashboard Release Please`. The cut finds the release pull request,
proves its head with the full merge gate, squash-merges it, and seconds later creates the
tag `v<version>` and an unpublished draft release, then dispatches
[the release orchestrator](.github/workflows/product-release.yml) for that tag. The
orchestrator measures the tagged tree, builds and verifies every artifact, attaches them
to the draft, publishes it once as `latest`, proves acquisition on the oldest supported
loaders, and only then bumps the Homebrew and Scoop channels. A
failure before publication leaves an invisible draft rather than a half-finished release.
Fix the cause and re-dispatch `Dashboard Release` for the same tag. A release pull request
merged by hand is released by the next dispatched cut.

The proof comes before the merge because a release tag cannot be deleted: a release commit
that failed its gate after its tag existed would be a permanent tag of a commit nobody can
ship. The tag follows the merge with nothing in between for a different reason — see the
recovery runbook below.

### When the cut cannot create the tag

A cut can stop at `Create the release for the merged proposal` with
`Resource not accessible by integration`, and its `Name a release this token cannot tag`
step names the tag. The workflow token never holds the `workflows` permission, and without
it GitHub refuses any tag or release that targets a commit whose workflow files differ
from `main` — even once the tag exists. A workflow change that landed between the release
commit's merge and its tag, as when a pull request merged by hand waits for its cut,
therefore blocks the release for good: no rerun and no later cut can finish it.

Finish it with your own credentials, as the cut would have, relabelling the release pull
request first so the next cut does not pick it up again:

```sh
REPO=nevenincs/vaultspec-dashboard
PR=<release pull request number>
VERSION=<version>
TAG="v$VERSION"
SHA=$(gh pr view "$PR" --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)

gh pr edit "$PR" --repo "$REPO" \
  --remove-label "autorelease: pending" --add-label "autorelease: tagged"
git fetch origin "$SHA"
git push origin "$SHA:refs/tags/$TAG"
git show "$SHA:engine/CHANGELOG.md" \
  | awk -v h="## [$VERSION]" 'index($0, "## [") == 1 { p = index($0, h) == 1 } p' \
  > release-notes.md
gh release create "$TAG" --repo "$REPO" --verify-tag --draft \
  --title "$TAG" --notes-file release-notes.md
gh workflow run product-release.yml --repo "$REPO" --ref "$TAG" \
  -f tag="$TAG" -f validation_only=false
```

No credential with `workflows` permission may be stored in this repository, which is why
this is a runbook rather than a workflow. Nothing beyond the workflow token is needed to
release; the checks on the release pull request are reported by a merge gate the proposal
job dispatches, because a pull request the workflow token authored starts no runs of its
own.

### Who can run CI

Only the repository owner and collaborators reach the self-hosted fleet directly. Every
other author — Dependabot included, whose pull requests carry author association
`CONTRIBUTOR` — runs nothing until a collaborator has read the change and applied the
`ci:full` label, which is what starts the merge gate. Until then the gate refuses the
commit and says so by name. Applying the label takes triage rights, so the label is the
review. A bot cannot grant it.

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
