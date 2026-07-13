---
generated: true
tags:
  - '#index'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - '[[2026-06-14-graph-node-semantics-P01-S01]]'
  - '[[2026-06-14-graph-node-semantics-P01-S02]]'
  - '[[2026-06-14-graph-node-semantics-P01-S03]]'
  - '[[2026-06-14-graph-node-semantics-P01-S04]]'
  - '[[2026-06-14-graph-node-semantics-P02-S05]]'
  - '[[2026-06-14-graph-node-semantics-P02-S06]]'
  - '[[2026-06-14-graph-node-semantics-P02-S07]]'
  - '[[2026-06-14-graph-node-semantics-P02-S08]]'
  - '[[2026-06-14-graph-node-semantics-P02-S09]]'
  - '[[2026-06-14-graph-node-semantics-P03-S10]]'
  - '[[2026-06-14-graph-node-semantics-P03-S11]]'
  - '[[2026-06-14-graph-node-semantics-P03-S12]]'
  - '[[2026-06-14-graph-node-semantics-P03-S13]]'
  - '[[2026-06-14-graph-node-semantics-P04-S14]]'
  - '[[2026-06-14-graph-node-semantics-P04-S15]]'
  - '[[2026-06-14-graph-node-semantics-P04-S16]]'
  - '[[2026-06-14-graph-node-semantics-P04-S17]]'
  - '[[2026-06-14-graph-node-semantics-P04-S18]]'
  - '[[2026-06-14-graph-node-semantics-P05-S19]]'
  - '[[2026-06-14-graph-node-semantics-P05-S20]]'
  - '[[2026-06-14-graph-node-semantics-P05-S21]]'
  - '[[2026-06-14-graph-node-semantics-P05-S22]]'
  - '[[2026-06-14-graph-node-semantics-P06-S23]]'
  - '[[2026-06-14-graph-node-semantics-P06-S24]]'
  - '[[2026-06-14-graph-node-semantics-P06-S25]]'
  - '[[2026-06-14-graph-node-semantics-P06-S26]]'
  - '[[2026-06-14-graph-node-semantics-P07-S27]]'
  - '[[2026-06-14-graph-node-semantics-P07-S28]]'
  - '[[2026-06-14-graph-node-semantics-P07-S29]]'
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-graph-node-semantics-plan]]'
  - '[[2026-06-14-graph-node-semantics-research]]'
---

# `graph-node-semantics` feature index

Auto-generated index of all documents tagged with `#graph-node-semantics`.

## Documents

### adr

- `2026-06-14-graph-node-semantics-adr` - `graph-node-semantics` adr: `node semantics: what a vault node represents` | (**status:** `accepted`)

### exec

- `2026-06-14-graph-node-semantics-P01-S01` - add an ontology module with an authority_class map from doc_type to register
- `2026-06-14-graph-node-semantics-P01-S02` - unit-test authority_class across every doc type plus the unknown fallback
- `2026-06-14-graph-node-semantics-P01-S03` - wire authority_class into the node_view document projection
- `2026-06-14-graph-node-semantics-P01-S04` - assert authority_class on the document list shape in graph query tests
- `2026-06-14-graph-node-semantics-P02-S05` - parse the ADR H1 status line into a type-specific lifecycle state
- `2026-06-14-graph-node-semantics-P02-S06` - parse the audit worst-finding severity into a lifecycle max_severity
- `2026-06-14-graph-node-semantics-P02-S07` - carry the plan tier alongside progress in the lifecycle
- `2026-06-14-graph-node-semantics-P02-S08` - parse rule active or superseded status into the lifecycle
- `2026-06-14-graph-node-semantics-P02-S09` - unit-test the type-specific lifecycle parse with honest degradation
- `2026-06-14-graph-node-semantics-P03-S10` - add the aggregate collapsibility hint for exec records bound to a parent plan
- `2026-06-14-graph-node-semantics-P03-S11` - fold authority_class and aggregate onto the node_view projection
- `2026-06-14-graph-node-semantics-P03-S12` - ensure the id derivation is unchanged by the additive node fields
- `2026-06-14-graph-node-semantics-P03-S13` - test the enriched node_view carries authority and aggregate additively
- `2026-06-14-graph-node-semantics-P04-S14` - add a derivation-label function from relation, doc_type pair, and provenance
- `2026-06-14-graph-node-semantics-P04-S15` - read the generated-by label from the exec id container path
- `2026-06-14-graph-node-semantics-P04-S16` - project edges as values carrying a derivation field distinct from relation
- `2026-06-14-graph-node-semantics-P04-S17` - prove the derivation label is not part of the edge stable key
- `2026-06-14-graph-node-semantics-P04-S18` - test the edge_view derivation labels across the pipeline vocabulary
- `2026-06-14-graph-node-semantics-P05-S19` - add the rule node kind and its identity prefix
- `2026-06-14-graph-node-semantics-P05-S20` - project rule nodes from the rules tree as authority law with active state
- `2026-06-14-graph-node-semantics-P05-S21` - mint promoted-from derivation edges from rule back to its audit
- `2026-06-14-graph-node-semantics-P05-S22` - test rule species projection without implying rules are vault documents
- `2026-06-14-graph-node-semantics-P06-S23` - type the additive node and edge ontology fields in the stores engine types
- `2026-06-14-graph-node-semantics-P06-S24` - add the ontology fields to the fixture corpus byte-for-byte like live
- `2026-06-14-graph-node-semantics-P06-S25` - serve the additive ontology fields from the mock graph route
- `2026-06-14-graph-node-semantics-P06-S26` - feed a captured live sample through the client path and assert the fields
- `2026-06-14-graph-node-semantics-P07-S27` - run the full lint gate to exit zero across frontend and rust
- `2026-06-14-graph-node-semantics-P07-S28` - run the engine test suite and the relevant frontend vitest suites green
- `2026-06-14-graph-node-semantics-P07-S29` - verify the additive wire delta is honored on success and error envelopes

### plan

- `2026-06-14-graph-node-semantics-plan` - `graph-node-semantics` plan

### research

- `2026-06-14-graph-node-semantics-research` - `graph-node-semantics` research: `node semantics: the epistemic ontology of vault documents`
