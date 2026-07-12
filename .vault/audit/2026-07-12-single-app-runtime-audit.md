---
tags:
  - '#audit'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - '[[2026-07-12-single-app-runtime-plan]]'
  - '[[2026-07-12-single-app-runtime-adr]]'
---

# `single-app-runtime` audit: `post-execution review of the seat law, front door, and lifecycle runtime`

## Scope

Adversarial review of the full single-app-runtime delivery (commits
`150c0bb7d6`, `97b69126aa`, `853fec9c8a`, `4524f1cb25`, `51f3ec9710`,
`71d042ffc5`, `f997ae1469`) against the ADR's decision set: safety and
correctness of the seat lock, discovery publication, shutdown paths, the
launcher, and the workspace-less boot; architectural-fence conformance
(read-and-infer, resource bounds, tiers, frontend store/design laws); and
test honesty. Two delegated reviewer agents went silent mid-review
(a known background-pool failure mode), so this pass was performed inline
by the orchestrating principal with the same lens; findings that produced
code changes are marked fixed with their commit.

## Findings

### launcher-spawn-wait | high | a cold index outruns the launcher's discovery wait — FIXED (`f997ae1469`)

Discovery publishes only after the initial index; on a large corpus that
legitimately takes minutes, while the launcher waited 30 s and then
reported "did not come up" (and the crash-loop guard then suppressed the
retry window). The wait is now 180 s and the guard message names
slow-start as a likely cause. Residual: an extreme first index could still
outrun 180 s; the attach path recovers on the next invocation.

### shutdown-route-ungated | high | the new `/shutdown` route initially escaped the bearer gate — CAUGHT BY GUARD, fixed pre-commit

The route was registered without its `API_PREFIXES` entry; the existing
anti-drift test (`every_contract_route_requires_a_bearer`) failed the run
and the prefix was added before the change ever landed. Recorded as
evidence the guard works, not as a shipped defect.

### csp-line-continuation | medium | CRLF corrupted the CSP string continuation — CAUGHT BY TEST, fixed pre-commit

The first CSP literal used backslash-newline continuations that the CRLF
checkout turned into embedded padding; the extended header test caught the
malformed policy and the literal was rebuilt with `concat!`.

### bootstrap-git-init | medium | judgment call: `gix::init` under the app home

The workspace-less boot initializes a scratch repository inside
`~/.vaultspec/bootstrap/`. This is a deliberate engine-owned-storage
exception to the never-mutate-git fence (no user repository is touched;
the directory is deletable and re-derivable, exactly like the engine-data
cache), gated to SEATED serves only so the test harness's fail-loud
contract is untouched. Accepted; documented in the boot module and the
runtime docs. Any future widening of this exception should return to
review.

### boot-order-vs-discovery | low | seat is held for minutes before discovery exists on a cold boot

Between seat acquisition and discovery publication (the initial index), a
second launch neither attaches (no discovery) nor spawns (seat refused at
bind... actually at lock). Behavior is correct (the second serve fails
loud naming nothing, the launcher's cold path hits the crash-loop guard's
now-honest message) but the window is observable. Acceptable; publishing a
provisional "starting" discovery record is a possible future refinement.

### stale-discovery-not-retracted-by-stop | low | `stop` leaves a stale foreign discovery file in place

When discovery names a dead foreign pid, `stop` reports "not running" and
deliberately does not delete the file (not the owner); the next seated
boot's takeover rewrites it. Consistent with the owner-check law; noted so
nobody "fixes" it into a clobber.

### shared-tree-residuals | low | two gate reds belong to a parallel session's uncommitted WIP

The full-tree gate carries one failing vitest guard (`git-changes-summary`
scoped-cache enrollment) and one module-size baseline breach
(`stores/server/authoring.ts` +4) from a concurrently-active session's
uncommitted work. Neither file is touched by this feature's commits; both
are that session's to close before it commits.

## Recommendations

- Consider a provisional "starting" discovery record (state field) so the
  launcher can distinguish indexing from death during the cold window.
- When a native folder picker lands (ADR O6, deferred), revisit the
  first-run typed-path entry.
- The MSI channel (packaging-ADR v2) is the path to installer-created
  Start-Menu shortcuts; the docs currently teach pinning.
- Verdict: approve. All CRITICAL/HIGH findings are fixed in-branch; the
  mediums are accepted judgment calls recorded above.
