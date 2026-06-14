---
tags:
  - '#research'
  - '#graph-node-semantics'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-graph-representation-research]]"
  - "[[2026-06-14-graph-node-salience-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `graph-node-semantics` research: `node semantics: the epistemic ontology of vault documents`

This is the internal grounding for a node-ontology ADR: a precise, evidence-based account
of what each `.vault/` document type actually *is* in this framework, how the types relate,
their relative importance, and their volume asymmetry — drawn from the shipped templates
(`.vaultspec/rules/templates/`), the pipeline rules (`vaultspec.builtin.md`,
`vaultspec-system.builtin.md`, `vaultspec-codify.builtin.md`), the wire contract
(`2026-06-12-dashboard-foundation-reference` §2/§4), and empirical counts taken from
`.vault/` on 2026-06-14. The product renders this very corpus as a node graph, and the
wire today gives nodes only a *thin* identity (id, kind, doc_type, dates, generic
lifecycle, degree). The question this research answers: what does a node *mean*, and what
semantics must the ontology layer add so a viewer's intent can re-rank the graph.

## Findings

### Per-document-type ontology

Each row characterizes one node species: what the document is, its epistemic role, its
pipeline position, its template sections, and the lifecycle/state signal a node should
surface.

| Type | Purpose / what it IS | Epistemic role | Pipeline position | Lifecycle / state signal |
|---|---|---|---|---|
| **research** | Open-ended exploration of a problem space | Inquiry / evidence-gathering — knowledge as *findings*, not yet decisions | Phase 1a entry point; feeds the ADR | None intrinsic; implicitly superseded by a later ADR consuming it |
| **reference** | Grounding in *existing source code* — files, lines, modules a coding agent will consult | Code-grounding — knowledge as *located fact* | Phase 1b parallel entry point; grounds ADR + exec | None; durable but descriptive |
| **adr** | The unit of **design authority**: records the decision, rationale, consequences; *binds* an implementation | Decision / commitment — knowledge as *binding choice with rationale* | Phase 2 (Specify); requires research; authorizes the plan | **Status: proposed → accepted → rejected → deprecated** (deprecated = superseded). A first-class ontological state |
| **plan** | The unit of **status / roadmap authority**: decomposes an ADR into an `Epic > Wave > Phase > Step` tree; *generates* execution, *tracks completion* | Roadmap / orchestration — knowledge as *executable, trackable structure* | Phase 3 (Plan); requires ADR; spawns exec records | **Tier L1–L4** + **per-step check-state** → progress {done,total}. The richest lifecycle node |
| **exec-step** | One Step Record: evidence one plan Step was executed — what was done, outcome, incidents | Evidence-of-work / ledger entry — knowledge as *individual proof of execution* | Phase 4 (Execute); one-to-one with a Step row | Carries `step_id`; value is *aggregate*, not individual |
| **exec-summary** | Rolls up every Step Record in one Phase | Aggregation / phase-close | Phase 4 close, per Phase | Phase-completion / verification status |
| **audit** | Reviews plans + exec + code against the ADR; surfaces findings by severity | Review / verdict — knowledge as *graded findings against an obligation* | Phase 5 (Verify) | Findings carry **severity** (critical/high/medium/low); verdict drives revision precedence |
| **rule / codify** | A durable cross-session constraint promoted from an audit/ADR; binds future agents | Norm / law — knowledge as *standing obligation* | Phase 6 (Codify), discretionary; promoted from audit | **Active / Superseded** status (supersede chains). Lives outside `.vault/` |
| **index** | Auto-generated feature manifest linking every `#{feature}` doc | Manifest / generated view — not authored knowledge | Cross-cutting, CLI-managed | `generated: true`; a derived node |

### Type relationships and the derivation chain

The pipeline is a strict dependency DAG ("artifacts lower in the hierarchy reference those
above them"). Relationships are concrete in the `related:` frontmatter (quoted wiki-links,
flat namespace) and the directory-tag taxonomy. The derivation edges as they actually
appear: research → adr (ADR requires research; Rationale references it); reference → {adr,
exec} (grounding consulted during implementation); **adr → plan** (plan requires an
approved ADR — this is the *binds* edge: an ADR binds the implementation through the plan
it authorizes); **plan → exec-step (one-to-one)** (each Step produces exactly one record;
the record's filename encodes the plan container path `W##-P##-S##` — the strongest,
most structural derivation in the corpus); exec-step → exec-summary (many-to-one per
phase); {plan, exec, code} → audit (audit reviews completed steps); audit → rule (codify
promoted-from audit, recorded in `derived_from:`; an ADR's "Codification candidates"
section is a second path to a rule). The connective tissue is the **feature tag**: every
document carries one directory tag plus `#{feature}`, so the graph has **two orthogonal
edge families** — the *pipeline-derivation chain* (research→adr→plan→exec→audit→rule via
`related:`) and the *feature-membership star* (everything sharing `#{feature}`).

### Volume asymmetry (empirical, this vault, 2026-06-14)

Counts over `.vault/`: research 10, reference 3, adr 26, plan 14, audit 11, index
(generated) 25, **exec step records 232**, exec summaries 28, exec total 260. Total
authored primary documents (excl. generated index) = 324, of which **exec step records
alone are 232 (≈72%)**. Grounding ratios: ~16.6 exec steps per plan (the two large
foundation plans dominate — engine 56 steps, gui 50 steps); ~10:1 exec records per ADR;
~24:1 per audit; ~87:1 per reference. ADRs (26) slightly outnumber plans (14): a feature
often spawns several decision records but consolidates execution into one plan. Plan
step check-state across all 14 plans: 275 closed vs 5 open (~98% complete) — itself a
corpus-wide lifecycle signal a roadmap view would surface. **The shape: a few
high-authority nodes (3 reference, 14 plan, 26 adr, 11 audit) and a long tail of ~232
low-individual-importance exec records. Any layout that treats all nodes as equal weight
is visually dominated by the exec records that individually matter least.**

### Importance asymmetry and its dependence on viewer intent

Importance is a function of *what the viewer is trying to learn*, and each type's intrinsic
structure is *why* it is the authority for that intent.

- **ADR — design authority.** Important when the viewer asks "*why is the system this way,
  and is that decision still in force?*" It records the choice *and the reasoning and the
  cost* (Problem/Considerations/Constraints/Rationale/Consequences) and explicitly binds an
  implementation. Its **status (accepted / deprecated)** makes it the one type whose
  authority can be *revoked*: a deprecated ADR is superseded design that should read as
  faded/struck-through, never deleted. Empirically 25/26 are accepted, 1 proposed.
- **Plan — status / roadmap authority.** Important when the viewer asks "*what is being
  built, how far along, what is left?*" It *generates* execution and is the only type that
  natively *tracks completion* (checkboxes → progress) and carries a **tier (L1–L4)**. A
  plan node should surface progress as a ring and tier as weight; it is the natural anchor
  of a status/timeline view.
- **Exec records — aggregate evidence.** An individual record ("ran the gate, committed,
  green") is low-importance in isolation; its value emerges in aggregate (232 records are
  the proof the roadmap executed). But for a *forensic / "what happened"* viewer the Notes
  field of a specific record is suddenly the most important node in the graph. This is the
  clearest intent-dependence in the ontology: the *same* node swings from least- to
  most-important with the viewer's question.
- **Audit — judgment.** Important for "*is the work sound, what must change?*"; carries
  **severity** and a verdict that can *block* forward work. A node should surface its
  worst-finding severity.
- **rule — standing law.** Important for "*what binds me going forward?*"; **active /
  superseded** governs whether it still binds. Few in number, maximal in reach.
- **research / reference — substrate.** High value to an implementer mid-task, low value
  to a status dashboard.

Lifecycle/state signals a node should surface: **ADR status** (accepted/deprecated/
superseded), **plan tier + progress ring** (done/total), **audit max-severity**, **rule
active/superseded**, **feature in-flight vs archived** (the archive lifecycle), and the
**`generated: true`** flag distinguishing derived index nodes from authored ones.

### Gap vs the thin wire node model

The contract (§4) defines the wire node as `id, kind, doc_type?, feature_tags[], title,
dates{created,modified}, lifecycle{state, progress?{done,total}},
degree_by_tier{declared,structural,temporal,semantic}`, with §2 stable identity. This
captures *structural identity, generic lifecycle, and connectivity* but flattens or omits
most of the ontological semantics above:

- **No type-specific epistemic role / authority class.** `doc_type` is an opaque enum;
  the wire does not encode that an ADR is design authority while an exec record is
  low-individual-value evidence. `degree_by_tier` measures connectivity, not authority.
- **`lifecycle.state` is generic, not type-shaped.** One `state` string cannot distinguish
  an ADR's accepted/deprecated/superseded from a plan's in-progress/complete from an
  audit's findings-open/closed from a rule's active/superseded — each type has its own
  state machine. ADR **supersession** specifically has no representation.
- **No severity / verdict channel** for audit nodes; **no plan tier** (progress is present,
  but the L1–L4 complexity signal is not — two plans with equal progress but different tier
  are ontologically very different).
- **Derivation-edge semantics are not typed.** `degree_by_tier` are *engine inference
  tiers*, not the *pipeline-derivation relations* (authorizes, generated-by, reviews,
  promoted-from, aggregates) that are the heart of the ontology; they must be inferred from
  unlabeled `related:` edges.
- **No aggregate-vs-individual weighting** (nothing tells the renderer 232 exec nodes
  should collapse into their parent plan while 26 ADRs stay individually weighted);
  **no `generated` flag**; **no feature-lifecycle** (in-flight vs archived); **no "rule"
  node species at all** (rules live outside `.vault/`).

**In short:** the thin wire node is a good *identity-and-connectivity* primitive but an
*intent-blind* one. It knows a node's id, type-string, dates, generic state, and degree —
but not its *authority class*, its *type-specific state machine*, its *severity/tier*, its
*derivation role*, or its *aggregate weight*. The node-ontology ADR's job is to layer those
properties — authority tier, per-type lifecycle vocabulary, derivation-relation labels,
and intent-dependent weighting — alongside the §4 fields so a viewer's intent can re-rank
the graph (the mechanism for which is the companion salience research).
