---
tags:
  - '#research'
  - '#semantic-rollback-summaries'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - '[[2026-07-14-frontend-localization-adr]]'
  - '[[2026-06-29-agentic-authoring-api-contract-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-rollback-history-adr]]'
  - '[[2026-06-29-agentic-review-station-state-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
---

# Semantic rollback summaries research

This research examines how rollback proposals can carry semantic, locale-agnostic summary data while preserving durable authoring history. It recommends an additive contract for a future decision. It does not establish an accepted decision.

## Live contradiction

`ReviewStation` sends the English literal `reviewer-initiated rollback` as the rollback `reason` at `frontend/src/app/authoring/ReviewStation.tsx:123`. The V1 request requires that string at `engine/crates/vaultspec-api/src/authoring/api/mod.rs:702`; the handler forwards it unchanged at `engine/crates/vaultspec-api/src/authoring/http/handlers3.rs:876` and `:897`; and rollback generation stores it as the new changeset summary at `engine/crates/vaultspec-api/src/authoring/rollback/mod.rs:529`.

That summary is durable identity-bearing material. It is stored through `engine/crates/vaultspec-api/src/authoring/ledger/mod.rs:49` and `:95`, included in aggregate digest input at `:221` and `:276-301`, copied into `ProposalProjection.summary` at `engine/crates/vaultspec-api/src/authoring/projections/mod.rs:165` and `:640`, retained by `frontend/src/stores/server/authoring/adapters.ts:94-105`, and rendered visibly and accessibly at `frontend/src/app/authoring/ReviewStation.tsx:365-367`. Provenance projections also retain it at `engine/crates/vaultspec-api/src/authoring/review/mod.rs:225-233` and `:744-754`.

The implementation therefore turns presentation-language copy into command input, ledger identity, and projected UI data. It also loses durable rollback lineage: source identity and ordered child keys exist only in the command and transient generator request. Rollback replay derives an ID only from source ID and idempotency key at `engine/crates/vaultspec-api/src/authoring/rollback_inverses.rs:92-105`, so reuse of a key with changed children or rationale can replay the first result without detecting a contract conflict.

## Governing constraints

The accepted localization decision requires typed semantic catalog keys, rendering-boundary translation, complete localized messages, and no diagnostic or internal metadata leakage. Accepted authoring decisions require scoped durable idempotency with payload-conflict detection, immutable rollback changesets that identify their applied source, preserved actor provenance and rationale, backend-owned review projections, and durable proposal and rollback records.

These decisions do not contradict one another. A preserved rollback reason need not be generated localized prose. It can be optional user-authored audit rationale, while generated summary semantics remain typed data interpreted at the presentation boundary.

## Options

1. Replace rollback copy in `ReviewStation` when `kind === "rollback"`. This is small, but leaves English in the API, ledger digest, provenance, and other clients. It also leaves lineage and idempotency defects unresolved.
2. Generate the English summary in the engine. This removes the frontend literal but makes the engine a localization authority and embeds one language in durable history.
3. Replace every ledger summary with a discriminated semantic type. This produces a strong aggregate model, but because summary participates in the current V2 digest it would require dual digest codecs or immutable revision rewrites.
4. Add durable typed rollback origin plus an additive semantic summary projection. This preserves existing ledger hashes, separates backend semantic authority from frontend language authority, and supports mixed-version migration.

Option 4 is recommended. The recommendation remains subject to an ADR decision.

## Recommended contract

Keep authored proposal summaries as user or agent data. Make rollback command `reason` optional and bounded, and treat it only as authored audit rationale. `ReviewStation` should omit it when a user selects “Prepare rollback” because that action does not author prose.

Persist an immutable `RollbackOriginRecord` atomically with each generated changeset. The record should contain the rollback changeset ID, exact source changeset ID and applied revision, ordered source child keys, optional authored rationale, request or origin digest, and creation timestamp. Give it an integrity digest plus foreign-key and uniqueness constraints. Do not rewrite existing ledger records or revision identities.

For new rollbacks, retain the source proposal's authored summary in ledger `summary` and retain `kind=rollback` as semantic identity. Add an optional bounded projection union such as `{ kind: "rollback", source_summary: string }`. The frontend adapter must validate the closed union and must not derive localization keys from wire tokens.

At render time, a valid rollback projection resolves one complete catalog message with `source_summary` as authored data. A rollback without semantic metadata, including a historical row, resolves a generic localized “Rollback proposal” label. A non-rollback renders its authored summary or the existing localized untitled fallback. Source IDs, child keys, rationale, idempotency material, revision tokens, and raw semantic tokens must never be displayed. User-facing provenance or activity views should consume the same semantic projection contract.

## Compatibility and migration

Add authoring-store migration 21 after version 20 at `engine/crates/vaultspec-api/src/authoring/store/schema.rs:13` and `:1101`. Do not infer legacy rollback origins from summaries or document targets because the current one-way rollback ID cannot prove lineage. Historical rollback rows should use the generic localized fallback.

During transition, accept legacy `reason` as optional authored rationale while new clients omit it. An additive response field lets old clients continue reading `summary`; new clients remain compatible with old servers by mapping `kind=rollback` without semantic metadata to generic localized copy. Do not recompute existing `authoring.ledger.v2` digests. The sidecar origin record avoids revision-token churn and immutable-history rewrites.

## Idempotency consequences

Route rollback through the durable idempotency repository in `engine/crates/vaultspec-api/src/authoring/store/idempotency.rs:15-150`, following proposal orchestration at `engine/crates/vaultspec-api/src/authoring/proposal/mod.rs:695-780`. Compute the request digest over actor-scoped command identity, exact source ID and revision, ordered child keys, and optional rationale.

An identical actor, command, key, scope, and digest should replay the recorded outcome. Reusing the actor, command, and key with a changed source, revision, child list, or rationale should return an idempotency conflict. New rollback ID derivation should include actor provenance or the durable receipt digest so different actors cannot collide on the same opaque key. Compatibility handling should first check the legacy source-plus-key ID and replay only when the stored actor matches; otherwise it should report conflict.

## Terminology

Use “Prepare rollback” for the action and “Rollback proposal” for the generated proposal label, or a complete localized equivalent that incorporates the authored source summary. Do not use “revert” as a synonym. Do not expose “preimage”, “inverse”, “changeset”, child keys, revision tokens, reason codes, lifecycle tokens, or other implementation vocabulary. Static copy must use sentence case, stable imperative verbs, concise actionable wording, and no em dashes. `source_summary` remains untranslated authored data; only its complete static wrapper is localized.

## Blast radius

The engine change spans `authoring/api/mod.rs`, `authoring/http/handlers3.rs`, `authoring/rollback/mod.rs`, `authoring/rollback_inverses.rs`, `authoring/store/schema.rs`, a narrowly owned rollback-origin repository, `authoring/projections/mod.rs`, and potentially `authoring/review/mod.rs` for user-facing provenance. The frontend change spans `stores/server/authoring/wireTypes.ts`, `stores/server/authoring/adapters.ts`, `stores/server/authoring/index.ts`, `stores/server/authoring/reviewStationVocabulary.ts`, `app/authoring/ReviewStation.tsx`, the English catalog, real French and Arabic resources, and catalog policy.

## Proof requirements

Engine proof must cover optional rationale parsing, atomic origin persistence, migration and integrity constraints, projection rebuilds, source-revision binding, ordered child-key digesting, actor-scoped replay, conflicting-payload rejection, legacy replay behavior, and unchanged existing ledger digests. Relevant existing test anchors include `authoring/api/tests.rs:235-275`, `authoring/http/tests/helpers2.rs:204-225`, `authoring/http/tests/group2.rs:740-820`, `authoring/rollback/tests.rs:530-700`, and `authoring/projections/tests.rs`.

Frontend proof must validate the bounded wire union, reject unknown variants, preserve authored `source_summary` as data, resolve complete English, French, and Arabic messages at render time, use the generic fallback with old servers and historical rows, and prevent adverse internal values from reaching visible or accessible output. Relevant anchors include `frontend/src/stores/server/authoring.test.ts:156-230`, `frontend/src/app/authoring/ReviewStation.render.test.tsx:300-350`, catalog parity and interpolation tests, policy checks, and the localization scanner.
