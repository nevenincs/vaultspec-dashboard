---
tags:
  - '#audit'
  - '#release-standard'
date: '2026-09-30'
modified: '2026-09-30'
body_schema: 'body-v2'
body_hash: 'sha256:d99a5cb1acab064623965b110301c85878d18350dec49bf3b8415068bafc097e'
related: []
---

# `release-standard` audit: `ci release surface`

## Scope

Every workflow under `.github/workflows/`, the release-please configuration, and the
`.github/scripts/` helpers, read at commit `60fce959` on `main`. The question is what
causes a release, what proves the commit a release is built from, and whose code reaches
the self-hosted fleet. Locators below are line numbers in that commit's files.

### release authority | high | a push to main releases before anything has judged the merged tree

`release-please.yml` ran on every push to `main` with no `skip-github-release`, so a push
that produced a version bump created the tag and the draft release and dispatched the whole
distribution chain. The merge gate never saw the merged tree. Since a release tag cannot be
deleted, a release commit whose gate failed afterwards would be a permanent tag of a commit
nobody can ship, and the version is spent.

### release credential | high | a workflows-capable token lives in the repository the lanes protect

`release-please.yml:13` states the reason: a pull request the workflow token authors starts
no workflow runs, so the release pull request could not report its required check without a
personal access token. `release-please.yml:44` passes it to release-please and
`release-please.yml:73` persists it in a checkout that pushes. A dispatch is exempt from
that rule and its check run lands on the branch head the pull request waits on, so the
token buys nothing a dispatch does not. What it costs is that the credential able to rewrite
the lanes that judge a release is stored beside them.

### pre-checkout execution | high | six jobs run a repository script before their own checkout

`ci.yml:39`, `code-health.yml:29`, `release-please.yml:67` and `merge-gate.yml:56`,
`:226`, `:330`, `:460`, `:513` all invoke `bash .github/scripts/reclaim-workspace.sh`
before `actions/checkout`. The runners are persistent and three share the machine, so the
tree on disk at that moment is whatever the previous job left - which can be any branch,
including a Dependabot pull request's. The step therefore executes the previous branch's
copy of that script under the new job's credentials and permissions. A leftover
`.git/hooks` survives `git clean` as well, so a hook from a previous job runs on the first
commit a later job makes.

### required verdict | medium | the required gate is skipped for a fork, and a skipped required check passes

`merge-gate.yml:550` conditions the verdict job on
`(github.event_name != 'pull_request' || head.repo.full_name == github.repository) && (always())`. For a fork the whole job is skipped, and GitHub counts a skipped required check
as satisfied, so the one case the fork refusal exists for is the one case it never runs. The
refusal belongs in the job's steps, where it produces a red verdict rather than an absent
one. The guard covering this asserted `always()` as a substring, which the narrowing clause
left intact.

### fleet admission | medium | any author who can open a pull request here reaches the self-hosted fleet

`merge-gate.yml:47`, `:104`, `:220`, `:324`, `:454`, `:507`, `ci.yml:30` and
`runner-policy.yml:10` gate only on the head repository being this one. An author who is
neither owner nor collaborator pushes a branch of this repository, so the fork clause never
stops them and the approval requirement for outside contributors does not cover them;
Dependabot arrives daily and its pull requests carry author association `CONTRIBUTOR`. On
the merge gate the label is the only door, and nothing required it to have been applied by a
user rather than by a bot.

### gate ref | medium | a caller cannot name the commit it wants measured

`merge-gate.yml`'s `workflow_call` declared no inputs and every job checked out the run's
own ref. A caller therefore measures whatever its own ref resolves to, which is what makes
proving a specific candidate commit before merging it impossible to express.

### injection surface | low | step outputs and event values are interpolated into shell command lines

`merge-gate.yml:124`, `:353`, `:474`, `:646` and `release-please.yml:80` interpolate
`steps.toolchain.outputs.channel` - a value read out of a repository file - directly into a
`run:` command line, and the label-removal step interpolates `github.repository` and the
pull request number. Carrying each through `env:` removes the shape entirely.

### downstream triggers | informational | no workflow listens for a tag push or a release event

Confirmed absent across every workflow. `release.yml` and `product-release.yml` are
`workflow_call`/`workflow_dispatch` only, and the chain after the tag is an explicit
dispatch. Nothing to remove; worth a guard so it stays that way.

## Recommendations

Adopt the fleet release standard rather than patching the current shape: proposal on push
with releases skipped, release on dispatch, the full gate on the candidate's exact head
before the merge, the tag immediately after it, and the distribution chain started by
dispatch. That is one decision and it settles the first two findings together, since the
dispatched gate on the release branch is what retires the personal access token.

Make the pre-checkout reclaim inline and self-contained in every job that needs it. A
script, a recipe and a local composite action are all resolved out of the workspace, which
is the tree being reclaimed, so there is no factoring that is also safe; byte equality
across the copies, asserted by a guard, is the available substitute.

Give the verdict job the condition `!cancelled()` and nothing else, and move every refusal
into its steps so an untrusted author, a fork and a bot-applied label are each named.

Require the author to be owner or collaborator on the lanes that run on every push, and
require a user's `ci:full` on the gate. Write the author test as two equality comparisons
rather than a membership call, so a scenario evaluator can decide it.

Take the ref to measure as a required input on the gate's call surface, and have every
caller name it.

The dev-server workflow's pull-request-reachable job cannot be covered here: the file is a
byte-identical render of a machine-wide harness held in a private repository, and a local
edit would fail its parity check. Raise it with that harness.
