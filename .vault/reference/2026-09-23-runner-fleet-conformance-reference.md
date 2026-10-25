---
tags:
  - '#reference'
  - '#runner-fleet-conformance'
date: '2026-09-23'
modified: '2026-09-23'
body_schema: 'body-v2'
body_hash: 'sha256:d1e86c963c92235c5d1301efdc8da516ebf4ed1087c557193cdbe2fb5a8b1fb7'
related: []
---

# `runner-fleet-conformance` reference: `How the workflows carry the four-target fleet decision today`

This records how the repository implements the runner fleet decision as observed
in the working tree on 2026-09-24. It is not the original fleet investigation.
That investigation was a live, transient reading of registered runners, host
architecture and virtualization probes, dispatched probe legs, and memory
sampling across a real four-target dispatch; the fleet has changed since, so none
of it is re-observable and none of it is reconstructed here. What follows is
evidence of a different kind and says so: the decision's surviving shape in
configuration and workflow code, located line by line, plus the places where that
code no longer matches what the decision recorded.

## Summary

### The four legs and the label each selects

Four targets ship, one machine per target. The mapping is stated once, as prose,
in `.github/actionlint.yaml:19-23`, and is carried in code by two different
mechanisms depending on whether the job is hand-written or generated.

Hand-written jobs select a label list directly. The architecture is always
present alongside the OS, never implied: `[self-hosted, Windows, X64]` at
`.github/workflows/a2a-channel-feasibility.yml:85`, `[self-hosted, Linux, X64]`
at `.github/workflows/ci.yml:31`, and the same two shapes at roughly thirty other
sites. Neither ARM leg is ever reached by a literal `runs-on:`.

Matrix-driven jobs compose the same list from two matrix keys, so the target and
its runner cannot drift apart. The pattern is
`[self-hosted, "${{ matrix.os }}", "${{ matrix.arch }}"]`, used at
`.github/workflows/product-release.yml:215`,
`.github/workflows/a2a-product-certification.yml:99`,
`.github/workflows/a2a-product-contract.yml:90`, and
`.github/workflows/merge-gate.yml:112`. The `include:` block that feeds it pairs
each target triple with its `os`/`arch` pair; the release one is
`.github/workflows/product-release.yml:198-201` and enumerates all four targets
in four lines. Both ARM legs exist only inside such blocks, which is why a grep
for literal labels under-reports the fleet - the point
`.github/actionlint.yaml:78-81` makes explicitly before giving its own per-label
reach table at `.github/actionlint.yaml:83-100`.

The generated release workflow is the third mechanism and the awkward one.
`dist` holds one label STRING per target, so it cannot emit a label list;
`.github/workflows/release.yml:147` therefore translates `matrix.runner` into a
JSON label array with a chain of `fromJSON` conditionals, and falls through to a
deliberately unmatchable `unmapped-dist-runner-<name>` rather than to a default.
The strings it translates are set at `dist-workspace.toml:126-128` and
`dist-workspace.toml:167-168, 184-186`.

### Why every Linux job names an architecture

The Actions runner gives every self-hosted Linux machine the auto-assigned label
`Linux` whatever its instruction set, and two Linux runners are registered, so a
bare `runs-on: Linux` names both and the scheduler may pick either. The reasoning
is recorded at `.github/actionlint.yaml:34-51`: a shipped tree used to contain a
PyInstaller-frozen runtime, PyInstaller freezes only for the architecture it runs
on, and nothing downstream can detect the resulting mislabel because the manifest
is truthful about bytes and silent about instruction set.

That constraint is no longer universal.
`.github/workflows/product-release.yml:207-214` records that this job stopped
being architecture-bound once the freeze left it - the cargo builds cross-compile
from whatever host they land on - and keeps the architecture label anyway, for
reproducible scheduling rather than correctness. The constraint still binds
wherever a freeze survives, which is `.github/workflows/a2a-product-contract.yml`.

### The enumerated label set and the gate that makes a mis-selection loud

The admitted label set is `.github/actionlint.yaml:113-128`: three OS labels, two
architecture labels, `self-hosted`, and two custom labels `linux-x64` and
`linux-arm64`. Only the last two are load-bearing as admissions - actionlint
already knows the rest - and `.github/actionlint.yaml:4-16` says so plainly
rather than letting the file read as a stricter check than it is. The custom pair
exists solely because `dist` takes a single string per target; the hand-written
workflows do not use them.

The gate runs from a recipe, not from a YAML block. `justfile:204-207` defines
`check-workflow` as `dev lint workflow`; `dev/toolchain.py:230-236` defines that
target as `dev.actionlint` followed by `dev.ci_contract`; and CI invokes the
recipe itself at `.github/workflows/ci.yml:73-75`, so the gate a developer runs
before pushing is the gate CI runs.

The binary is pinned and verified rather than downloaded and trusted.
`dev/actionlint.py:56` pins the version, the per-platform archive digests follow
it, and `dev/actionlint.py:121-130` refuses to execute an archive whose sha256
does not match. The pin is per platform on purpose: `dev/actionlint.py:30-37`
records that naming a single amd64 archive with a single digest PASSES
verification on an ARM64 runner and then dies at `Exec format error`, which is a
verification step that reports success while handing back an unusable binary.

Sub-linters are disabled explicitly at `dev/actionlint.py:220-224`
(`-shellcheck=`, `-pyflakes=`) because actionlint silently skips a missing
external linter, so leaving them implicit means the gate checks a different set
of things on every machine.

### How the aarch64-linux leg is hosted

The leg that the decision first refused is now served, on the fleet, and the
implementation is a container rather than a different machine. Both Linux legs
build inside a digest-pinned manylinux image: `dist-workspace.toml:170` for
x86_64 and `dist-workspace.toml:187` for aarch64, each pinned by `@sha256:`
rather than by tag. `.github/workflows/release.yml:150` applies the image to the
job. The stated reason at `dist-workspace.toml:130-135` is a glibc floor the
build environment enforces rather than one the build host happens to satisfy,
after v0.1.8 shipped a binary requiring glibc 2.39 from a host running 2.43.

`.github/actionlint.yaml:25-32` records the operational cost that attaches to it:
the ARM64 Linux runner is itself a container, and until it is re-enrolled with
its home bind-mounted from the identical VM path, a container job there dies in
`Initialize containers` before any step runs. The recorded posture is that the
release fails closed on that leg rather than moving it to a hosted image. That is
a claim about machine state which this reference cannot verify; it is cited as
the configuration's own account, not as an observation.

The two ARM legs are reachable only through matrix `include:` blocks, so an
absent or mislabelled runner presents as a job that queues forever rather than
one that fails. `.github/actionlint.yaml:102-106` names the queue watchdog as
what bounds that, cancelling the run rather than waiting out the 24h ceiling.

A custom label is registration state, not machine state.
`.github/actionlint.yaml:69-77` records that re-running `config.sh` for either
Linux runner without passing its custom label drops it, and the next release then
queues forever with no error anywhere.

### The architecture guards

Two guards survive, both in freeze-bearing jobs, both comparing `uname -m`
against the matrix target and failing the job on mismatch:

- `.github/workflows/a2a-product-certification.yml:158-176`, "Refuse to certify
  on an architecture this runner is not". Its rationale at
  `.github/workflows/a2a-product-certification.yml:150-157` is that scheduling is
  the thing most likely to drift, since both Linux runners answer to `Linux`.
- `.github/workflows/a2a-product-contract.yml:155-173`, "Refuse to freeze for an
  architecture this runner is not". Same comparison, different consequence in its
  message: the frozen runtime cannot be cross-compiled, so the proof would smoke
  one architecture while claiming another.

Both are backstops on SCHEDULING rather than on the build, and with the
architecture labels in place they now pass truthfully on every leg instead of
refusing one.

### Divergences between the decision and the code

Recorded as findings, not fixed here.

- **The third arch guard no longer exists.** `.github/actionlint.yaml:53-58`
  states that three guards are retained, "in product-release.yml,
  a2a-product-contract.yml and a2a-product-certification.yml". Only two are
  present; `.github/workflows/product-release.yml` has none. The removal was
  deliberate and is documented in place at
  `.github/workflows/product-release.yml:302-306`, which lists restoring the
  native-architecture guard as one step of bringing the PyInstaller freeze back.
  The divergence is in the actionlint configuration's prose, which was not
  updated when the freeze left that job.
- **The lint gate is not where the decision put it.** The decision described a
  lint job running a pinned upstream binary verified by checksum. The
  verification and the pin are implemented exactly as described, but they live in
  `dev/actionlint.py` behind a just recipe, and `.github/workflows/` contains no
  actionlint job at all. The gate reaches CI only through
  `.github/workflows/ci.yml:73-75` calling `just check-workflow`. A reader
  looking for the decision in the workflows will not find it.
- **`dist` no longer validates the generated release workflow.**
  `dist-workspace.toml:86-90` records that the hand-applied label translation
  makes `dist` stop checking `.github/workflows/release.yml`, so a `dist` upgrade
  can silently diverge from what it would generate. The stated mitigation is a
  manual re-diff whenever `cargo-dist-version` moves - a human step with no gate
  behind it.
- **The refused leg's refusal is no longer the current state.** The decision's
  Implementation section refuses the aarch64-linux leg and its own Amendment
  reverses that the same day. The code implements the Amendment. Anyone reading
  the Implementation section alone will read a refusal the workflows do not
  carry.
