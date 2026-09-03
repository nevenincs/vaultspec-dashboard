---
tags:
  - '#adr'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:af86c8ebe94b6c37831bbea0d736fe182dee15bfb405e7420d3f92a4deb0775a'
related:
  - "[[2026-08-01-code-deduplication-campaign-remediation-research]]"
  - "[[2026-08-01-code-deduplication-canonical-homes-reference]]"
---
# `code-deduplication` adr: `Canonical direct-import consolidation` | (**status:** `accepted`)

## Problem Statement

The campaign has confirmed independently maintained production implementations of responsibilities that already have clear owners. The copies create drift in process safety, error interpretation, focus navigation, localized vocabulary, structural document meaning, corpus membership, pagination, listing progress, and write ordering. This ADR decides how remediation preserves intentional caller policy while removing duplicate ownership.

## Considerations

- `2026-08-01-code-deduplication-campaign-remediation-research` establishes that wrappers and compatibility aliases retain a second ownership surface.
- `2026-08-01-code-deduplication-canonical-homes-reference` identifies existing source-owned primitives and the bounded new modules required for unowned shared mechanics.
- The existing frontend, engine, resource-bound, keyboard, localization, and wire contracts remain binding.

## Considered options

1. Directly consolidate each duplicated mechanic into its existing or narrowly created source-owning module, then delete all local copies.
2. Retain local forwarding wrappers or compatibility aliases during migration.
3. Move all frontend or structural policies into broad omnibus modules.
4. Make no ownership change and repair individual behavioural divergences.

## Constraints

The implementation must use direct imports from the canonical source module. It must add no re-export, alias, forwarding wrapper, compatibility layer, new service, or long-lived port. Existing caller-specific policy remains at the caller. The user-owned A2A lifecycle changes are out of scope and must remain untouched. Every migration needs a real regression test that uses production behaviour rather than a fake wire or mock shortcut.

## Implementation

D1. Adopt the direct-consolidation option. `bounded_child` owns asynchronous serve-path process mechanics and `paginate` owns stable keyset pagination.

D2. Establish direct stores-layer owners for shared HTTP bearer/error mechanics and keyed serialization; retain client endpoint policy and dashboard mutation policy at call sites. Keep the generation-aware listing drain private to the engine client, parameterized by route policy.

D3. Extend `useFocusZone` for the minimal navigation variants required by the three composite migrations, while leaving activation and confirmation local. Route all document-type presentation through the canonical vocabulary and delete local maps.

D4. Add distinct structural metadata and vault corpus enumeration APIs in `ingest-struct`. Graph, historical, authoring, and content callers import these APIs directly and keep their own projection, cap, and error policy.

D5. Delete every superseded implementation in the same change that migrates its callers. A new canonical source is not complete until no duplicate or forwarding implementation remains.

## Rationale

Option 1 is the only option that creates one unambiguous home per responsibility while preserving boundaries the grounding records establish. Option 2 fails the direct-import constraint. Option 3 conflates intentionally distinct policy with shared mechanics. Option 4 leaves proven drift in place. The decision follows the evidence and ownership map in `2026-08-01-code-deduplication-campaign-remediation-research` and `2026-08-01-code-deduplication-canonical-homes-reference`.

## Consequences

The remediation is deliberately phased, and every phase deletes code as it centralizes behaviour. Tests become more focused: owner tests cover shared mechanics, while domain tests cover each caller's policy. The focus migration is serial because its composites have distinct accessibility policy. Structural parsing and corpus enumeration are separate phases despite sharing one crate. Any unexpected caller that cannot directly import an owner is a design question, not permission to add a shim.
