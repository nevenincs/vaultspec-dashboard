---
tags:
  - '#audit'
  - '#ledgered-edit-migration'
date: '2026-07-10'
modified: '2026-07-10'
related:
  - "[[2026-07-09-ledgered-edit-migration-plan]]"
  - "[[2026-07-09-ledgered-edit-migration-audit]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace ledgered-edit-migration with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `ledgered-edit-migration` audit: `W05 post-migration hardening closeout`

## Scope

The W05 post-migration hardening wave, added after the epic closeout to resolve the two
recommendations the closeout audit left open: a structured denial discriminator on the
direct-write wire so neither side routes a collision by matching prose, and a definitive
disposition of the CreateDocument delete-inverse gap. It audits the two hardening phases
(the denial-kind cutover across engine and frontend, and the delete-inverse feasibility
disposition) and records that both closeout recommendations are now discharged. Both
hardening phases were adversarially reviewed as they landed; this closeout records the
aggregate outcome and the wave's completion.

## Findings

### structured-denial-kind-shipped | info | the direct-write collision now routes on a machine-readable discriminator, not reason prose

The frontend previously routed a rename or create path-collision by substring-matching the
backend's denial reason text, mirroring the backend's own conflict-versus-denied reason
sniffing. The hardening carries a structured discriminator end to end. The engine adds a
machine-readable denial-kind enum (path-collision, stale-base, scope-mismatch,
forbidden-actor, self-approval, other) onto the direct-write outcome and record, classified
from the typed conflict kind at the gate site rather than from the reason string, with the
contract that a denied outcome always carries a concrete kind (defaulting to a catch-all,
never null) and every non-denied status carries none. The existing conflict-versus-denied
routing was correctly retained alongside it, not replaced, because approval-stage staleness
also reads as stale text and must still reach the richer conflict shape. The frontend
consumes the discriminator, routes the rename collision branch on the structured kind alone,
and deletes the reason-substring constant with zero surviving consumers. The load-bearing
proof is a test that feeds a deliberately reworded reason together with the path-collision
kind and still asserts a collision outcome, so a regression back to textual matching fails
hard. The classification traces to structure on both sides, verified by two live-core
backend tests whose two collisions share no classifying substring yet both yield
path-collision, and by two live-wire frontend assertions that round-trip the committed
backend field. Both the backend and frontend halves were independently reviewed and approved
with no findings. This discharges the first closeout recommendation.

### create-delete-inverse-upstream-gated | info | the CreateDocument delete-inverse is confirmed upstream-gated, filed, and honestly deferred

A ledgered CreateDocument ships non-rollback-eligible because its only inverse is a
single-document delete and the ledger has no delete verb. The disposition confirms the gap
is genuinely upstream, not a local omission: the vaultspec-core vault surface exposes no
single-document delete or remove verb, and the authoring boundary forbids reaching the vault
by any path other than the vaultspec-core adapter, so no raw-filesystem or git delete is
permissible here. A compliant delete-inverse therefore cannot be built in this repository; it
is gated on an upstream vaultspec-core capability. The coordination ask toward vaultspec-core
is filed and the disposition recorded in the feature reference, with a return trigger to wire
the capability and admit CreateDocument the day the upstream delete verb lands. Until then
create stays honestly non-rollback-eligible with a reason and a manual-repair hook, exactly
as the ADR deferred, verified intact in the rollback eligibility admit-list. This discharges
the second closeout recommendation as an honest deferral, not a defect.

### w05-hardening-complete | info | the post-migration hardening wave is complete and the plan reaches full closure

Both hardening phases are done, reviewed, and gated green, bringing the plan to full
closure. Every hardening step is checked, the denial-kind cutover carries a green frontend
gate (type-check, lint, format, and the touched suite online against a real engine) and a
green backend authoring suite, and the delete-inverse disposition is recorded rather than
faked. With this wave the migration's two open recommendations are both discharged and the
ledgered-edit-migration feature carries no remaining in-scope follow-on.

## Recommendations

- No new work. The delete-inverse return trigger stands: when vaultspec-core ships a
  bounded single-document delete verb, wire it as a core capability and admit CreateDocument
  to the rollback eligibility set, at which point a ledgered create becomes invertible.
