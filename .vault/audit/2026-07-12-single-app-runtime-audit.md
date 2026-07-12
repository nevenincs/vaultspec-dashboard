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

### delegated-review-arrival | info | both delegated reviewers reported after the inline pass

The two reviewer agents were not dead, only slow; their reports arrived
after the inline audit above. Verdicts: W01 approve-with-nits, W02/W03
approve-with-nits, consolidated final review REVISION REQUIRED (one HIGH,
five MEDIUM). Every finding and its resolution:

### s20-scope-overclaim | high | S20 was checked with only its docs half delivered — FIXED (plan split)

dist's shell/powershell installers cannot create shortcuts, so the
installer-shortcut half of S20 never landed while the box was checked.
Resolved by narrowing S20 to the delivered docs scope and adding S22 as an
honestly-UNCHECKED deferral whose return trigger is the packaging-ADR v2
MSI channel.

### launcher-concurrent-race | medium | the losing concurrent launcher reported a misleading failure — FIXED

Two simultaneous launches both spawned serve; the seat-lock loser polled
for its own pid forever and reported "did not come up". The launcher now
attaches to ANY live seat after its spawn wait expires
(`raced_concurrent_launch` in the payload).

### crash-guard-liveness | medium | the guard never checked whether the previous launch was alive — FIXED

The cold-launch decision is now a pure, unit-tested function over (last
record, now, pid-liveness): a recent LIVE pid reports "still starting"
without double-spawning; only a recent DEAD pid is treated as a crash
loop. `pid_alive` is a bounded silent subprocess probe.

### exemption-predicate-duplication | medium | the seat exemption was written twice — FIXED

`seat_eligible` is computed exactly once in the boot path and every
consumer reads it; the second hand-written `no_seat || port == 0` is gone.

### bootstrap-init-unserialized | medium | the bootstrap git-init ran before seat acquisition — FIXED

Seat acquisition now happens FIRST (it is workspace-independent), so the
bootstrap check-then-init only ever runs under the held lock. The
one-shot `provision` verb's bootstrap call remains unserialized
(stress-tested benign by the reviewer; single-invocation CLI surface).

### csp-document-untested | medium | CSP was proven on an API route, not the SPA document — FIXED

A new test fetches `/` and asserts the header rides the document AND the
served HTML contains no inline `<script>` and no external origin — the
two things the policy would break.

### launcher-pure-logic-untested | medium | no unit tests on launcher decision logic — FIXED

The cold-launch decision matrix, path-key normalization, and pid-liveness
now carry direct unit tests in the launcher module.

### kill-fallback-undrained-pipes | medium | kill_pid piped but never drained; run_bounded drained sequentially — FIXED

`kill_pid` (exit-code-only) now uses null stdio via a shared bounded
status runner; the update sidecar runner drains stdout and stderr
concurrently, each under its own cap.

### bootstrap-exception-codified | low | the git-init exception is now a named rule clause — FIXED

Promoted from a code comment into `architecture-boundaries.md` (source +
sync) as a SANCTIONED EXCEPTION with a no-new-site clause.

### deferral-closure | info | every recorded deferral driven to completion (user directive)

Post-PASS, the user directed all deferrals executed. Delivered: S22 (the
MSI channel with an installer-created Start-Menu shortcut targeting the
bare binary; Shortcut table verified inside a locally-built MSI via the
WindowsInstaller COM API), S23 (the starting-state discovery record:
bearer minted pre-index, bind moved before the initial index, heartbeat
fresh throughout, ready flip pre-serve; status and stop are state-aware
and a starting seat is stoppable via the pid fallback — this also
discharges the boot-order-vs-discovery LOW finding above), S24 (the
bounded bearer-gated directory-browse route), and S25 (the FolderBrowser
picker in the add-project flow, retiring typed-path-only entry — ADR
option O6 closed). The closure increment's review returned REVISION
REQUIRED (one HIGH: the launcher itself was still blind to the starting
state; two MEDIUMs: no automated starting-window coverage, and the
picker's listbox lacked roving-tabindex keyboard semantics; one LOW:
undocumented symlink-following markers). All four were fixed in the
revision commit — a state-aware `wait_for_seat_ready` (publish budget +
index budget, "still reading your project" instead of the crash-log
message for a live indexing seat), a capped test-only boot-delay knob
plus a boot-matrix proof that a starting seat is distinguishable and
stoppable, the roving-tabindex composite per the FeatureSearchField
precedent, and the symlink note — and routed back for re-check.

## Recommendations

- RESOLVED: the provisional starting discovery record shipped (S23).
- RESOLVED: the folder picker shipped (S24/S25); typed-path entry is now
  the fallback, not the only path.
- RESOLVED (user-directed, post-PASS): the MSI channel shipped with the
  installer-created Start-Menu shortcut (S22 closed); the built MSI's
  Shortcut table was verified via the WindowsInstaller COM API.
- Verdict after revision: the consolidated review's HIGH and all five
  MEDIUMs are fixed in-branch (see the finding log). The reviewer
  re-checked the revision commit line by line and returned PASS with no
  residual findings: the feature is approved for merge.
