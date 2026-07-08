---
tags:
  - '#audit'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
  - "[[2026-07-08-distribution-channels-adr]]"
---

# `distribution-channels` audit: `review and execution-truth closure`

## Scope

The mandatory code review of the distribution-channels implementation (plan 12/12, commits `1b211f7b4c` through `51fea8993c`) by an independent reviewer that verified with tools rather than reading alone: it re-ran the feature-on suite in an isolated worktree at the tip commit (588 passed, isolating two failures to the unrelated uncommitted apply-fencing WIP), executed `dist plan` to confirm the `announcement_tag` field the bump job consumes, and corroborated the binstall `--git` refutation from binstall's own help text.

## Findings

### stray-provision-prefix | medium | a sibling session's uncommitted API_PREFIXES entry rode a pathspec commit

The shared worktree's in-flight provisioning plane had added `/provision` to the bearer-boundary prefix list in `engine/crates/vaultspec-api/src/routes/spa.rs`, and this feature's commit of that file swept the line in undocumented. Inert in the reviewed range (no provision route exists in committed history), and deliberately KEPT rather than dropped - the list is a security boundary and the sibling's routes must never land without their prefix already gated - now annotated in place naming the sweep and the reason. Lesson recorded: a pathspec commit still commits the whole file in a shared tree.

### verified-clean | low | everything else checked out against the ADR including its execution-time amendment

Both staging paths clean-copy (rm before cp); the fail-loud compile error preserved; no stale references to the escaping embed path; the gitignore verified with `git check-ignore`; the scoop manifest idiom, versioned URLs, and bin name verified; the bump job's field usage, loud failure on a 404 hash fetch, idempotent re-run, bot identity, and non-escalating permissions verified; the README's binstall guidance matches the empirical refutation and the amended ADR row.

## Recommendations

- Post-merge watch: the first release after this merge exercises the scoop-bump job live; confirm the bot commit lands and `scoop update` picks it up.
- The scope-guard adoption commit (`fcb01a4cfa`, after the reviewed range) responded to the sibling authorization floor landing mid-flight; it rode the same review posture (suites green on both sides) and CI is the arbiter.
- Final verdict: PASS with nits; the one MEDIUM is annotated in source rather than dropped, for the security reason above. No open critical or high findings.
