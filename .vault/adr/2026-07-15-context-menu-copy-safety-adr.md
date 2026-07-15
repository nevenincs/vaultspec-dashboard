---
tags:
  - '#adr'
  - '#context-menu-copy-safety'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-context-menu-copy-safety-research]]"
  - "[[2026-06-15-dashboard-context-menus-adr]]"
  - "[[2026-07-14-frontend-localization-adr]]"
---

# `context-menu-copy-safety` adr: `Use public references instead of transport identifiers` | (**status:** `proposed`)

## Problem Statement

The accepted context-menu decision defined raw identifier copy actions for graph nodes and
graph islands. That inventory predates the localization decision that prohibits wire tokens,
action identifiers, diagnostic state, and other implementation vocabulary from general
user-facing output. The current graph-node action copies the normalized transport identity,
including prefixes such as `doc:`, `code:`, and `feature:`. A generic Copy label hides the
payload but does not make it user-facing.

The application now has a supported document reference: a round-trippable `[[stem]]` link
shared by document surfaces. Other graph entity kinds do not carry an equivalent public
reference. A narrow decision is required to preserve useful copy behavior where a genuine
reference exists and refine only the conflicting graph-node and island clauses of the older
inventory.

## Considerations

- A public reference is intended for user exchange and round-trips through a supported
  product workflow without knowledge of wire schema.
- Clipboard output is user-facing output. A vague label is not a safety boundary.
- Document wiki links already provide one supported public reference and one shared action.
- A feature or code transport ID cannot become a public reference by stripping its prefix.
- Commit hashes, pull-request numbers, paths, filenames, branch names, document titles, and
  document links are established user-domain identifiers and remain untranslated data.
- The clipboard substrate must continue serving legitimate bounded public values. Safety
  belongs at the producer and reference-authority boundary.
- The earlier context-menu ADR remains authoritative for the menu system, sections, gating,
  and all unaffected inventory.

## Considered options

- **Retain raw IDs.** Preserves diagnostic convenience but exposes graph transport syntax.
  Rejected because it conflicts with the later no-leakage decision.
- **Relabel raw IDs as item references.** Changes the label but not the payload. Rejected as
  cosmetic concealment.
- **Remove every identity-like action.** Prevents leakage but also removes legitimate
  document links, commit hashes, pull-request numbers, paths, filenames, and branches.
  Rejected as unnecessarily broad.
- **Use a public reference where defined and otherwise omit the action.** Document entities
  reuse the canonical document-link action; unsupported graph entities expose no general
  reference action. Chosen.

## Constraints

- The application has no general public URL scheme for graph entities. The document wiki
  link is the only current graph-node reference with a supported round trip.
- The graph-node entity contract does not carry a public code or feature reference distinct
  from its transport ID. This decision cannot infer one.
- Shared-action identity remains binding. Document copy links compose the existing action
  rather than introducing graph-specific copy or translation logic.
- Non-mutating public-reference actions remain available during time travel.
- Raw identifiers may appear only in structured logs or a diagnostic surface absent from
  user-facing production builds. A hidden label, query flag, or CSS concealment is not a
  production fence.
- Verification uses production resolvers, runtime catalogs, and live clipboard behavior
  without mocks, fakes, stubs, patches, skipped tests, or mirrored business logic.

## Implementation

**D1 - Classify copy payloads by reference authority.** General menus may copy user-authored
content or an established public domain reference. They may not copy graph transport
identities, entity serialization, tier values, or diagnostic payloads. A new public
reference requires an explicit domain contract and a supported round trip.

**D2 - Reuse the document-link action for document graph entities.** When a graph node or
island represents a document and the existing bounded mapper derives a valid stem, its menu
composes the canonical document copy-link action. The payload is exactly `[[stem]]`; label,
action identity, feedback, and locale behavior remain shared with other document surfaces.

**D3 - Omit unsupported graph references.** Feature nodes, code nodes, graph islands without
a document stem, edges, and meta-connections expose no raw-reference action unless a later
accepted decision defines a public reference for that domain. The menu omits the action
instead of presenting a permanently disabled diagnostic placeholder. Independently
authorized title, summary, path, and content actions remain.

**D4 - Confine diagnostics outside the general action plane.** Raw graph identities remain
available to structured logging and may appear in a separately specified, production-fenced
diagnostic surface. Diagnostic access does not conditionally reveal a general menu action.

**D5 - Preserve established public domain identifiers.** Commit hashes, pull-request
numbers, paths, filenames, branch names, authored titles, and document links remain valid
explicit copy payloads. Their localized actions state what they copy. The clipboard
substrate retains its bounded identifier lane for these references.

**D6 - Amend only the conflicting earlier inventory.** The graph-node clause changes from
Copy ID and Copy title to Copy document link when the node is a document, plus Copy title
when available. The graph-island clause changes from Copy ID to Copy document link when the
island represents a document. All other context-menu architecture remains in force. Raw ID,
score, tier, and serialized export actions elsewhere become findings under their owning
localization steps.

**D7 - Prove public-reference safety at production boundaries.** Tests establish that
document-node and document-island menus compose the canonical copy-link descriptor, copy
exactly `[[stem]]`, remain available during time travel, and resolve through English,
French, and Arabic production catalogs. Non-document graph entities omit the reference
action. General graph menu text, accessible names, announcements, and clipboard output
contain no transport prefixes, raw edge identities, tier values, or serialized entity JSON.
A live browser test proves the terminal clipboard payload and absence of diagnostic controls
from production builds.

## Rationale

The later localization decision supplies the deciding constraint: transport and diagnostic
tokens cannot reach general user-facing output. Retaining or euphemistically relabeling raw
IDs fails that constraint. Removing every copyable identifier is unnecessary because the
codebase already distinguishes useful user data and has a proven public document-link
format.

This rule preserves user value without inventing reference schemes. Document graph entities
gain the link users already exchange elsewhere, while unsupported entities stop presenting
diagnostic convenience as a product action. Producer-level classification keeps the
clipboard platform reusable for legitimate domain identifiers.

## Consequences

- Document nodes and document islands expose a more useful round-trippable copy action with
  one descriptor across eligible planes.
- Unsupported graph entities lose raw-identity actions from general menus.
- Diagnostic workflows use structured logs or a separately authorized production-fenced
  surface instead of ordinary context menus.
- The dashboard-context-menus ADR remains accepted and binding outside the two amended copy
  clauses. Section order, time-travel policy, and resolver architecture do not change.
- Tests that treat Copy ID as a permanent non-mutating action change to assert the public-
  reference rule and omission behavior.
- Other raw-ID, score, tier, and serialized-entity actions are explicitly nonconforming and
  remain assigned to their owning localization steps.
- Future reference formats require an explicit domain contract, stable round trip, honest
  localized wording, and production-boundary verification.
