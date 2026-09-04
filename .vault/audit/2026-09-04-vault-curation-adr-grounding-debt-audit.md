---
tags:
  - '#audit'
  - '#vault-curation'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:01b6219cfbf16836e6dfe7d12234142f20330ffbc9f948f6db80e1e827c1a4ee'
related:
  - "[[2026-07-13-declared-edge-continuity-adr]]"
  - "[[2026-07-13-graph-slice-delta-adr]]"
  - "[[2026-07-31-runner-fleet-conformance-adr]]"
---
# `vault-curation` audit: `ADR grounding debt: three ungrounded ADRs reconciled`

## Scope

The vault schema check reports an error class — "ADR has no grounding references
(research, reference, or audit documents)" — that was the only red gate in the
repository. Three ADRs carried it, all authored in July and none introduced by
recent work: `2026-07-13-declared-edge-continuity-adr`,
`2026-07-13-graph-slice-delta-adr`, and
`2026-07-31-runner-fleet-conformance-adr`. A prior campaign established that no
grounding document exists under any name variant of those three feature tags,
and closed a fourth ADR in the same class where grounding genuinely existed.

This pass reconciles each of the three against the corpus and against the code
the decision governs, and decides per ADR between authoring grounding and
accepting the debt. The governing constraint is that a `related:` edge to a
document which is not actually the decision's supporting evidence would turn the
gate green and make the corpus lie — a worse outcome than a red gate. Every
mutation routed through the owning CLI verbs; no frontmatter was hand-edited.

## Findings

### grounding-existed-unlinked | medium | two of the three ADRs had real grounding in the corpus that was never linked

The premise that no grounding exists for any of the three was too strong. It
held for the feature tag; it did not hold for the evidence. Two of the ADRs are
direct follow-ons to earlier work whose research and audit records are in the
corpus under a different feature tag, and the corpus already admits cross-feature
grounding — `2026-07-12-vault-tree-delta-adr` is grounded by
`2026-06-13-constellation-live-delta-research` and passes the check.

For `declared-edge-continuity`, the grounding is the
`graph-worktree-edge-consistency` pair dated 2026-06-30. That research
recommended re-keying the declared-edge cache on a corpus content fingerprint
rather than the HEAD sha, and its identity-stability section established that a
declared edge's stable id is composed only from endpoints, relation kind, tier
and provenance. The ADR's problem statement names that same fingerprint key as
the mechanism that fails under churn, and its constraint that carried edges keep
their keys verbatim rests on exactly that identity guarantee. The accompanying
audit verified the shipped fix and already discusses a carry-last-good path and
the fingerprint timing the ADR generalises. The ADR is the sequel to that work,
not an unrelated decision.

For `graph-slice-delta`, the grounding is two research documents dated
2026-06-13. `constellation-live-delta-research` finding F2 identified the
architectural gap the ADR closes — the graph query keyframe carries no anchor on
the delta clock, the delta clock is document-granularity only, and the client is
forbidden from flattening document edges locally, which is the ADR's stated
reason for rejecting a client-side splice. `dashboard-optimization-research`
findings P-HIGH-1 and P-HIGH-2 diagnosed the invalidation storm in the exact live
sync module the ADR's refetch floor modifies, and prescribed the trailing-edge
debounce that the ADR records as shipped and insufficient under sustained churn.

Action taken: four `related:` edges added through the link verb. The schema
error count fell from three to one.

### fleet-grounding-unreconstructible | medium | the runner fleet ADR's evidence cannot be honestly relocated into a vault document

`runner-fleet-conformance` has no antecedent in the corpus, and unlike the other
two it cannot be given one honestly. Its evidence base is a live, transient fleet
investigation: an enumeration of registered runners, host probes reporting
machine architecture and virtualization tooling, dispatched probe legs, and
memory and swap sampling taken at fifteen-second intervals across a real
four-target dispatch. None of that is re-observable — the fleet has since
changed — so any document authored now would either restate the ADR's own prose
back at itself or present today's readings as the decision's evidence. Both
fabricate provenance.

The nearest corpus candidate, `2026-07-04-dashboard-packaging-research`, chose
the distribution engine whose single-label-per-target constraint the ADR later
discovered. That grounds one constraint, not the decision, and linking it would
overstate what it supports.

There is also a positive reason not to author one. The fleet topology is already
documented, at length and with more precision than a vault document would carry,
in the configuration it governs: `.github/actionlint.yaml` enumerates the label
set, the machine-to-target mapping, the reason every Linux job selects on
architecture, and which workflow reaches each label; `dist-workspace.toml`
records the per-target runner strings, why two of them are custom labels, and the
container pinning. A vault reference restating that would fork the fact away from
its live source and go stale on the next fleet change.

Verdict: the debt is accepted rather than paid. The gate stays red on this one
ADR, as an owned and documented state.

### fleet-adr-partially-stale | low | the aarch64 Linux leg no longer runs where the ADR's amendment decided it would

The ADR's amendment reverses its own refusal of the aarch64 Linux leg and records
serving it from a self-hosted Linux ARM64 container on the Apple Silicon host.
The shipped configuration has moved past that: the release build for that target
now names a GitHub-hosted ARM64 image, because the fleet's ARM64 Linux runner is
itself a container with no reachable docker daemon and a container job there
fails before any step runs. The self-hosted ARM64 Linux machine is still reached
by the runner probe and the two agent-to-agent product matrices, so the runner
has not been retired — only the release leg moved.

Reported, not actioned. Amending an accepted ADR to match the code it governs is
the retrofit path, which requires an explicit decision rather than a curation
edit.

### decisions-implemented | low | all three decisions are present in the shipped code

Checked as part of the reconciliation, since an ungrounded ADR is also a
candidate for being an unimplemented one. All three are implemented. The carried
declared-edge graft, its pruning to the fresh node set, and the
refreshing-versus-building tier distinction are present in the engine registry
with tests that exercise the graft, the ghost-endpoint drop and the capture. The
generation-keyed slice delta exists as an engine module and route with a frontend
reconciler and its own test file, and the refetch cooldown constant is defined
and used in the live sync module. The fleet decision is carried by the workflow,
actionlint and distribution configuration described above.

## Recommendations

- Treat the remaining schema error on `runner-fleet-conformance` as accepted
  corpus debt with this audit as its record, not as a defect to be cleared. It
  should be cleared only by a real grounding document, and none can be written
  honestly.
- Where a decision's evidence is a transient live observation — an incident, a
  wire capture, a fleet probe — capture it in a research document at the time.
  All three ADRs in this class recorded their evidence inline in the ADR body
  instead, which is why two needed archaeology and the third is unrecoverable.
- Before concluding that an ADR has no grounding, search the evidence rather than
  the feature tag. Two of these three were grounded all along under a different
  tag, and the corpus already accepts cross-feature grounding edges.
- A follow-on decision is needed on whether `runner-fleet-conformance` should be
  amended to record that the aarch64 Linux release leg is now hosted, or left as
  the decision that was made with the drift tracked elsewhere.
