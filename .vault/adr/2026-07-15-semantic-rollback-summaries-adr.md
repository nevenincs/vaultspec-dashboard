---
tags:
  - '#adr'
  - '#semantic-rollback-summaries'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-semantic-rollback-summaries-research]]"
  - "[[2026-07-14-frontend-localization-adr]]"
  - "[[2026-06-29-agentic-authoring-api-contract-adr]]"
  - "[[2026-06-29-agentic-changeset-ledger-adr]]"
  - "[[2026-06-29-agentic-rollback-history-adr]]"
  - "[[2026-06-29-agentic-review-station-state-adr]]"
  - "[[2026-06-29-agentic-authoring-state-store-adr]]"
---

# `semantic-rollback-summaries` adr: `Persist rollback origin and project localized semantic summaries` | (**status:** `proposed`)

## Problem Statement

Rollback creation currently accepts client-authored generated English as a required
reason. The backend stores that text as the rollback changeset summary. This behavior
makes presentation copy part of durable identity and exposes it through review and
provenance projections.

The durable record also omits exact rollback lineage. Source revision, ordered child
keys, and authored rationale remain command inputs rather than stored origin facts.
Replay identity does not cover the full request payload, so one idempotency key can
silently replay an outcome for different rollback inputs.

This decision conceptually supersedes two implementation behaviors: using a
client-authored generated rollback reason as the summary, and replaying rollback without
payload conflict detection. It does not change the status of the accepted governing
ADRs.

## Considerations

- Authored proposal summaries and optional authored rationale are data. They remain
  unchanged and untranslated.
- Generated interface text belongs to typed locale catalogs and resolves only at the
  rendering boundary. Translated text must never persist in authoring records.
- Rollback remains a new immutable changeset with actor provenance and exact applied
  source identity.
- Existing ledger records, revision identities, and `authoring.ledger.v2` digests must
  remain unchanged.
- Backend projections own rollback semantics. Frontend code must not infer localization
  keys from wire tokens or expose source identifiers, child keys, rationale, digests, or
  revision tokens.
- Mutating commands require actor-scoped durable idempotency. A reused key with a
  different payload must produce a conflict rather than replay an unrelated result.

## Considered options

- **Replace the frontend literal only.** This removes one call-site string but preserves
  locale-specific command data, incomplete lineage, and unsafe replay. Rejected.
- **Generate an English summary in the backend.** This centralizes wording but makes the
  backend a localization authority and persists one presentation language. Rejected.
- **Replace every ledger summary with a semantic union.** This creates a uniform model,
  but changes digest inputs and requires immutable history rewrites or dual codecs.
  Rejected.
- **Add durable rollback origin and a semantic summary projection.** This preserves
  ledger identity, records exact lineage, supports localized presentation, and permits
  mixed historical data. Chosen.

## Constraints

- The changeset ledger, authoring store, rollback lifecycle, review projection, API
  boundary, and localization runtime are accepted and stable parent systems. This
  decision extends their contracts without replacing their authority.
- Migration 21 must follow migration 20. It adds origin storage and indexes without
  rewriting legacy rows or recomputing ledger digests.
- Legacy summaries cannot prove source lineage. Migration must not infer origins from
  summary text, document targets, or deterministic rollback identifiers.
- A missing semantic projection must remain safe. Historical rollbacks and responses
  from older servers use a generic localized rollback label.
- Request compatibility is asymmetric. Existing clients may continue sending `reason`
  to a new server, but a new client that omits it cannot use an older server unchanged.
  Deployment therefore requires the server contract first or an explicit capability
  gate.
- Integrity, size, foreign-key, uniqueness, and bounded-query constraints apply to the
  new durable record and projection fields.

## Implementation

We will add an immutable `RollbackOriginRecord` sidecar for every newly generated
rollback changeset. The backend stores it atomically with the changeset. The record contains the rollback
changeset ID, exact source ID and applied revision, ordered source child keys, optional
authored rationale, request or origin digest, creation timestamp, and integrity digest.
Foreign-key and uniqueness constraints bind one origin to one rollback changeset.

Make rollback command `reason` optional and bounded. Treat a supplied value only as
authored audit rationale. Product actions that do not collect prose omit it. Keep
authored proposal summaries as data, and retain the source proposal summary in the new
rollback's ledger summary without translating it.

Expose an optional bounded semantic summary projection. A rollback variant carries the
authored source summary as data. The frontend validates the closed union and resolves
one complete localized message around that data at render time. A rollback without valid
semantic metadata resolves a generic localized label. Non-rollback proposals continue
to render authored summaries or the localized untitled fallback.

The English catalog uses `Prepare rollback` for the action and `Rollback proposal` for
the generic label. Every locale provides complete equivalents. Presentation surfaces do
not use `revert` as a synonym or expose rollback implementation vocabulary.

Route rollback through the durable idempotency repository. Digest actor-scoped command
identity, source ID and revision, ordered child keys, and optional rationale. An exact
retry replays the recorded outcome. Reusing the key with any changed digest input returns
an idempotency conflict. New rollback identity includes actor provenance or the durable
receipt digest. Legacy replay occurs only when the stored actor matches.

Authoring-store migration 21 adds the sidecar and projection support. It does not rewrite
legacy records, revision identities, or ledger digests. Historical rollbacks remain
valid and receive the generic localized presentation.

## Rationale

The research found that generated English crosses the command, ledger, digest,
projection, and presentation boundaries. Moving the literal alone would hide the
architectural defect without restoring lineage or replay safety.

The additive sidecar preserves immutable history while recording the facts required for
audit and conflict detection. A semantic projection lets the backend own meaning while
the frontend owns language. Keeping authored summaries and rationale as data preserves
user intent without treating either field as translated interface copy.

## Consequences

- New rollbacks gain durable source lineage, payload-aware replay, and locale-independent
  presentation without changing existing ledger hashes.
- Review, provenance, and activity surfaces can share one semantic summary contract and
  one localized vocabulary.
- Historical records remain usable but cannot gain trustworthy lineage retroactively.
  Their presentation is less specific by design.
- The API remains compatible for old clients calling a new server. New clients require
  a migrated server before omitting `reason`, so deployment order becomes a contract.
- Atomic sidecar persistence, migration integrity, projection rebuilding, and legacy
  replay checks add backend complexity and test obligations.
- Authored source summaries can contain any user-provided language. Localization wraps
  that data but does not translate, normalize, or reinterpret it.
