---
tags:
  - '#plan'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_hash: 'sha256:843115823634547235cad286332eb5d7de972814c042af967c2ee07e7a9abcdd'
tier: L3
related:
  - '[[2026-08-01-code-deduplication-adr]]'
  - '[[2026-08-01-code-deduplication-campaign-remediation-research]]'
  - '[[2026-08-01-code-deduplication-canonical-homes-reference]]'
  - '[[2026-08-01-code-deduplication-rag-campaign-audit]]'
---

# `code-deduplication` plan

## Steps

## Wave `W01` - establish canonical owner contracts

Create and prove the narrow owner APIs required before direct-import migrations.

### Phase `W01.P01` - bounded process and pagination owner coverage

Strengthen existing API and query owners with regression-first proof.

- [x] `W01.P01.S01` - Write regression coverage for bounded child process lifecycle and strengthen the canonical owner; `engine/crates/vaultspec-api/src/bounded_child/`.
- [x] `W01.P01.S02` - Write regression coverage for keyset cursor semantics and retain the canonical paginator; `engine/crates/engine-query/src/envelope.rs`.

### Phase `W01.P02` - stores-owned shared mechanics

Introduce narrow direct-import modules for shared stores mechanics.

- [x] `W01.P02.S03` - Write regression coverage for bearer transport and tiers-preserving failures then create its owner; `frontend/src/stores/server/httpTransport*`.
- [x] `W01.P02.S04` - Write regression coverage for keyed write serialization then create its owner; `frontend/src/stores/server/keyedSerializer*`.

### Phase `W01.P03` - focus and vocabulary owners

Extend the existing focus owner and retire the deprecated vocabulary alias.

- [x] `W01.P03.S05` - Write regression coverage for focus navigation variants and extend the canonical primitive; `frontend/src/app/chrome/useFocusZone*`.
- [x] `W01.P03.S06` - Write regression coverage for localized types and remove the deprecated vocabulary alias; `frontend/src/stores/server/docTypeVocabulary*`.

### Phase `W01.P04` - structural metadata parsing

Create typed status and tier parsing without a graph-local forwarding surface.

- [x] `W01.P04.S07` - Write regression coverage for typed metadata and add direct structural parsers; `engine/crates/ingest-struct/src/metadata*`.

### Phase `W01.P05` - vault corpus enumeration

Create a distinct normalized structural corpus-membership API.

- [x] `W01.P05.S08` - Write regression coverage for vault corpus membership and add its direct enumeration API; `engine/crates/ingest-struct/src/vault_corpus*`.

## Wave `W02` - migrate engine consumers and delete backend copies

Directly import established backend owners and delete every duplicated lifecycle, parser, traversal, and paginator implementation.

### Phase `W02.P06` - provisioning bounded-child migration

Migrate each provisioning workflow independently to the existing bounded child owner.

- [x] `W02.P06.S09` - Write regression coverage then migrate version probing to the bounded child owner; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `W02.P06.S10` - Write regression coverage then migrate migration probing to the bounded child owner; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `W02.P06.S11` - Write regression coverage then migrate capability probing to the bounded child owner; `engine/crates/vaultspec-api/src/routes/provision.rs`.

### Phase `W02.P07` - authoring pagination migration

Replace authoring slicing with the direct shared paginator import.

- [x] `W02.P07.S12` - Write regression coverage then replace authoring pagination with the canonical paginator; `engine/crates/vaultspec-api/src/authoring/documents.rs`.

### Phase `W02.P08` - structural metadata consumers

Route graph and historical projections through typed structural metadata.

- [x] `W02.P08.S13` - Write regression coverage then replace graph ADR facet parsing with the typed owner; `engine/crates/engine-graph/src/index/mod.rs`.
- [x] `W02.P08.S14` - Write regression coverage then replace graph plan tier parsing with the typed owner; `engine/crates/engine-graph/src/index/mod.rs`.
- [x] `W02.P08.S15` - Write regression coverage then replace historical metadata parsing with the typed owner; `engine/crates/engine-graph/src/asof.rs`.

### Phase `W02.P09` - corpus-enumeration consumers

Route graph, historical, and authoring consumers through direct structural imports.

- [x] `W02.P09.S16` - Write regression coverage then replace graph worktree corpus traversal with the canonical enumerator; `engine/crates/engine-graph/src/index/mod.rs`.
- [x] `W02.P09.S17` - Write regression coverage then replace historical corpus traversal with the canonical enumerator; `engine/crates/engine-graph/src/asof.rs`.
- [x] `W02.P09.S18` - Write regression coverage then replace authoring listing traversal with the canonical enumerator; `engine/crates/vaultspec-api/src/authoring/documents.rs`.
- [x] `W02.P09.S19` - Write regression coverage then replace authoring stem scans with canonical corpus filtering; `engine/crates/vaultspec-api/src/authoring/documents.rs`.

## Wave `W03` - migrate store clients and write ordering

Migrate every stores consumer independently, preserving endpoint policy while deleting shared mechanics copies.

### Phase `W03.P10` - direct HTTP transport imports

Replace four client-local bearer and error converters with direct imports.

- [x] `W03.P10.S20` - Write regression coverage then migrate the engine client to the direct HTTP transport owner; `frontend/src/stores/server/engine/client*`.
- [x] `W03.P10.S21` - Write regression coverage then migrate the authoring client to the direct HTTP transport owner; `frontend/src/stores/server/authoring*`.
- [x] `W03.P10.S22` - Write regression coverage then migrate the agent client to the direct HTTP transport owner; `frontend/src/stores/server/agent/index*`.
- [x] `W03.P10.S23` - Write regression coverage then migrate the A2A team client when its exact scope is free; `frontend/src/stores/server/agent/a2aTeam*`.

### Phase `W03.P11` - generation-aware listing drain

Extract one private engine-client drain and migrate both public listing walks.

- [x] `W03.P11.S24` - Write regression coverage then add the private generic generation-aware listing drain; `frontend/src/stores/server/engine/client*`.
- [x] `W03.P11.S25` - Write regression coverage then route the vault-tree walk through the private drain; `frontend/src/stores/server/engine/client*`.
- [x] `W03.P11.S26` - Write regression coverage then route the code-file walk through the private drain; `frontend/src/stores/server/engine/client*`.

### Phase `W03.P12` - keyed write serialization

Migrate panel and filter queues to direct keyed-serializer imports.

- [x] `W03.P12.S27` - Write regression coverage then replace panel write chaining with the keyed serializer; `frontend/src/stores/server/dashboardState*`.
- [x] `W03.P12.S28` - Write regression coverage then replace filter write chaining with the keyed serializer; `frontend/src/stores/server/dashboardState*`.

## Wave `W04` - remove presentation and focus duplicates

Delete local vocabulary and focus mechanics while preserving surface-specific policy.

### Phase `W04.P13` - breadcrumb vocabulary

Migrate breadcrumbs to canonical localized document-type presentation.

- [x] `W04.P13.S29` - Write regression coverage then replace breadcrumb type labels with canonical vocabulary; `frontend/src/app/viewer/docTrail*`.

### Phase `W04.P14` - vault-row vocabulary

Migrate row presentation to canonical localized document-type presentation.

- [x] `W04.P14.S30` - Write regression coverage then replace vault-row type maps with canonical vocabulary; `frontend/src/app/left/vaultRowPresentation*`.

### Phase `W04.P15` - creation-dialog vocabulary

Migrate creation labels before the serial focus migration touches the same dialog.

- [x] `W04.P15.S31` - Write regression coverage then replace dialog type labels with canonical vocabulary; `frontend/src/app/left/CreateDocDialog*`.

### Phase `W04.P16` - segmented focus migration

Migrate segmented navigation first and delete its bespoke focus machinery.

- [x] `W04.P16.S32` - Write regression coverage then migrate segmented controls to the canonical focus zone; `frontend/src/app/kit/Segment*`.

### Phase `W04.P17` - creation-dialog focus migration

Migrate focus-only unavailable-row traversal after its vocabulary change.

- [x] `W04.P17.S33` - Write regression coverage then migrate dialog focus to the canonical focus zone; `frontend/src/app/left/CreateDocDialog*`.

### Phase `W04.P18` - context-menu focus migration

Migrate disabled-row skipping and menu navigation last, retaining menu policy locally.

- [x] `W04.P18.S34` - Write regression coverage then migrate context-menu focus to the canonical focus zone; `frontend/src/app/menu/ContextMenuHost*`.

## Wave `W05` - post-remediation semantic-sweep follow-ups

Remediate newly confirmed low-severity duplicate mechanisms discovered by the fresh current-worktree RAG sweep.

### Phase `W05.P19` - actor transport canonicalization

Move duplicated actor authorization transport mechanics to the shared stores-owned HTTP boundary while retaining endpoint adapters locally.

- [x] `W05.P19.S35` - Write regression coverage then centralize actor-header transport mechanics and migrate direct clients.; `frontend/src/stores/server`.

### Phase `W05.P20` - listing document-type ordering canonicalization

Remove repeated document-type ordering from listing projections without merging their distinct grouping and sort policies.

- [x] `W05.P20.S36` - Write regression coverage then route listing document-type ordering through the canonical vocabulary owner.; `frontend/src/stores/server/queries`.

## Wave `W06` - final residual-shadow cleanup

Remove the final dead focus primitive and literal test protocol shadows identified by independent final review.

### Phase `W06.P21` - dead focus primitive removal

Delete the unused parallel roving-focus utility and its test so useFocusZone is the sole focus owner.

- [x] `W06.P21.S37` - Delete the dead parallel roving-focus utility and its direct test after semantic confirmation.; `frontend/src/app/chrome`.

### Phase `W06.P22` - actor protocol test canonicalization

Replace literal actor-header protocol in live tests with a direct canonical transport constant import.

- [x] `W06.P22.S38` - Replace live-test actor-header literals with the canonical shared transport constant.; `frontend/src/stores/server`.

## Wave `W07` - E2E protocol shadow cleanup

Remove the final E2E actor-header protocol literal through a direct canonical import.

### Phase `W07.P23` - E2E actor protocol import

Keep the framework-agnostic E2E client while importing the shared header constant directly.

- [x] `W07.P23.S39` - Replace the E2E actor-header literal with a direct canonical transport constant import.; `frontend/e2e/authoring`.
