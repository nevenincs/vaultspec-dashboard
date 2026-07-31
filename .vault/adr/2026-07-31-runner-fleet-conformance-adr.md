---
tags:
  - '#adr'
  - '#runner-fleet-conformance'
date: '2026-07-31'
modified: '2026-07-31'
body_schema: 'body-v1'
related: []
---

# `runner-fleet-conformance` adr: `Fleet topology for the four-target cohort: a macOS runner, an enumerated label set, and an unserved aarch64-linux leg` | (**status:** `proposed`)

## Problem Statement

The release contract names four targets, and the runner fleet registers two
machines: an x86_64 Windows workstation and an x86_64 WSL Linux instance on the
same host. No macOS runner and no ARM64 runner exist. Two of the four legs
therefore cannot be produced at all, so no complete cohort can be assembled and
no honest release can be cut.

The gap is not merely missing capacity. `runs-on: macOS` is selected by no
literal expression anywhere in the workflows — it is reached only through matrix
`include:` blocks — so the absence presents as a job that queues silently rather
than one that fails. That is the most expensive failure mode this pipeline has:
no log, no annotation, no conclusion. A decision is needed on which machine
carries each leg, how the fleet's labels are constrained so a mis-selection
fails loudly, and what to do about the one target for which no hardware exists.

## Considerations

- The four targets are `aarch64-apple-darwin`, `aarch64-unknown-linux-gnu`,
  `x86_64-unknown-linux-gnu`, and `x86_64-pc-windows-msvc`.
- A shipped product tree contains both cargo cross-builds and a PyInstaller-frozen
  runtime. PyInstaller freezes only for the architecture it runs on; it has no
  target flag. The cargo half cross-compiles, the frozen half cannot.
- Nothing downstream can detect the resulting mislabel: the member manifest is
  truthful about bytes and silent about instruction set, and every later check
  verifies the tree against itself. The arch guard in `product-release.yml` is
  the only stop, and it is a contract backstop rather than a build error.
- The Apple Silicon laptop is the only ARM machine in reach. It is macOS, not
  Linux, so it serves `aarch64-apple-darwin` and no Linux target.
- That laptop already hosts three unrelated runners under an operator power
  policy dated 2026-07-24: runners are stopped on battery and restored on AC, so
  jobs queue rather than fail when it is unplugged.
- The Windows workstation already hosts a second runner for a sibling project in
  its own directory and unit, so the coexistence pattern is established in-fleet.
- The repository is public, which makes GitHub-hosted runners — including the
  native `ubuntu-24.04-arm` image — free for it.
- Before this record, nothing in the repository ran `actionlint`, and no
  `actionlint.yaml` existed, while both sibling projects carry one.

## Considered options

- **Register the macOS runner on the existing Apple Silicon laptop (chosen for
  the darwin leg).** No new hardware; the machine is already a runner host with
  an established power policy. Costs: it sleeps on battery, and its disk is
  nearly full.
- **Leave the darwin leg unserved.** Honest but terminal — it blocks every
  cohort indefinitely while suitable hardware sits idle. Rejected.
- **Cross-compile `aarch64-unknown-linux-gnu` on the x86_64 Linux runner.** This
  is what the configuration comment claimed was already happening. It cannot
  work: it repairs the cargo leg and leaves the frozen runtime x86_64 inside an
  artifact labelled aarch64. Rejected outright — it is the exact failure the arch
  guard exists to refuse.
- **Emulate aarch64 on the Linux runner via qemu-user.** Produces genuinely
  aarch64 bytes, so it is not dishonest, but the emulation is absent, has no
  package candidate on the installed distribution, needs binfmt re-registration
  on every restart, and is slow and flake-prone for exactly this workload.
  Rejected as a primary; retained as a fallback.
- **Host a Linux ARM64 virtual machine on the Apple Silicon laptop.** Conceptually
  the best answer, since virtualization there is native rather than emulated. The
  machine cannot carry it: no virtualization tooling is installed, memory is
  modest, and free disk is in single-digit percent while that same machine is
  about to take on the darwin build. Rejected on capacity.
- **Move the one aarch64-linux leg to a GitHub-hosted ARM64 runner
  (recommended, not yet ratified).** A native aarch64 surface, free on a public
  repository, so the frozen runtime is genuine and the arch guard passes
  truthfully. Costs the property that every build runs on the self-hosted fleet.
- **A dedicated ARM64 machine — a free-tier cloud instance or a small board.**
  Preserves the self-hosted property and is honest, at the price of another
  always-on host to provision and maintain.

## Constraints

- The Apple Silicon laptop sleeps on battery and disables wake-on-network there,
  so it is unreachable over the network when unplugged. Standing it up requires
  the operator to put it on AC power; this is not automatable from off-machine.
- The runner service on macOS installs as a per-user agent in the GUI domain. It
  survives a reboot only where the account obtains a login session, so durability
  is bounded by automatic login. Raising that ceiling needs elevated rights the
  agent context does not hold.
- Free disk on that machine is in single digits as a percentage. A release build
  plus a freeze plus a composed tree may not fit, and this is unresolved.
- The lint gate runs the upstream binary rather than the container action the
  siblings use, because a Docker-based action already failed once on this
  runner's credential helper, which resolves only while the host's Docker
  Desktop is running.
- The label `Linux` is carried by any self-hosted Linux machine regardless of
  architecture. Adding an ARM64 Linux runner without arch-explicit selection
  would dispatch the two Linux targets nondeterministically.

## Implementation

A dedicated runner instance is installed on the Apple Silicon machine in its own
directory outside every repository tree, with its own work directory and its own
service, leaving the existing runners on both hosts untouched. Its registration
token is minted on demand and used transiently. It takes the auto-assigned
labels, which already satisfy both the release matrices and the target-to-label
table, so no workflow or distribution configuration changes. Rather than
overriding the machine's sleep behaviour, the runner conforms to the existing
operator power policy: it is enrolled in the same AC-gated supervisor as the
other runners on that host, so it stops on battery and returns on AC while jobs
queue in the interim.

Workflow linting becomes a standing cheap tier. A lint job runs the pinned
upstream release binary, verified by published checksum before it is unpacked,
against every workflow file, and fails the job rather than warning. Shell and
Python sub-linters are disabled explicitly rather than left implicit, so that
provisioning either tool on the runner for an unrelated reason cannot silently
turn the gate red. Alongside it, a configuration file enumerates the label set
the fleet can schedule onto, resolved out of the matrix blocks rather than
grepped for, so the next fleet change has one reviewed place to update.

The aarch64 Linux leg stays refused. The arch guard is retained unchanged, and
the target-to-label mapping is left alone, because changing that mapping is the
same act as choosing the runner that will serve it.

## Rationale

Splitting the decision by target is what makes it tractable: each leg goes to
the only surface that can produce it honestly, and the one leg with no such
surface is refused rather than faked. The darwin leg wins on the laptop because
the hardware, the access path, and the runner-hosting pattern all already exist
there, and its one real weakness — intermittent availability — is not a defect
but the documented, operator-chosen behaviour of that machine, which degrades
into queuing rather than into failure.

The decisive argument on the aarch64 Linux leg is that no amount of tooling can
manufacture an aarch64 interpreter on an x86_64 host, because the freeze step
must run the interpreter it bundles. That reduces the option space to surfaces
that are actually ARM64, and among those the hosted runner is free, native, and
needs no maintenance, while the alternatives cost either capacity the fleet does
not have or an additional machine to keep alive. Refusing the leg in the interim
is strictly better than shipping it, because a mislabelled artifact passes every
check this pipeline has and fails only on a user's machine.

The lint gate earns its place on evidence rather than symmetry: two workflow
defects reached the default branch and were rejected as zero-second runs with no
log, and the first class is caught instantly with a line number by exactly this
tool.

## Consequences

- The darwin leg becomes producible once the machine is on AC power and the
  runner is registered, which is the single remaining gate on a complete cohort
  other than the aarch64 Linux leg.
- That runner's availability is intermittent by design. A release started while
  the laptop is on battery queues rather than fails, which is the intended
  behaviour but will read as a hang to anyone who does not know the policy.
- Durability is bounded by automatic login on that machine, matching the three
  runners already there. This is a real ceiling, not a proven guarantee, and it
  should be stated as such rather than reported as reboot-safe.
- Free disk on that host is a live risk to the first release run and is not yet
  resolved.
- No complete four-target cohort is possible until the aarch64 Linux leg is
  given a native surface. The pipeline cannot currently emit a partial cohort
  either, because the digest step requires all four members, so a three-of-four
  release would itself be a deliberate contract change.
- Two further workflows map the aarch64 Linux target onto the x86_64 Linux
  runner and carry no arch guard. One of them executes the artifact, so it would
  report a mislabelled tree as certified. Whatever runner decision is taken for
  the release leg has to be applied to both.
- The configuration comment asserting that the aarch64 Linux leg cross-compiles
  on the x86_64 runner was false and has been corrected where it appeared; the
  equivalent claim in the distribution configuration remains to be corrected.
