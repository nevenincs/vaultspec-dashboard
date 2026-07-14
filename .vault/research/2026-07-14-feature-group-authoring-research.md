---
tags:
  - '#research'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-12-authoring-surface-research]]"
  - "[[2026-07-12-authoring-surface-adr]]"
---

# `feature-group-authoring` research: `feature-group document creation`

The New-document dialog shipped by the authoring-surface epic treats creation
as an isolated (type, feature, title) triple. The user's direction: reframe
creation — in language and architecture — as managing the contents of a
FEATURE GROUP (add a new feature, select an existing feature, add a document
to a feature), with the pipeline hierarchy respected (no ADR without upstream
research) and cross-links written automatically. This research grounds that
reframe: what the domain model actually says a document is, what the current
surface does, what the wire and CLI already support, and where the design
decisions lie.

## Findings

### The domain model already says documents are feature-lifecycle artifacts

The framework's own contract answers the framing question affirmatively. Every
`.vault/` document carries exactly one directory tag plus exactly one
`#{feature}` tag; the feature tag "groups related documents across the feature
lifecycle" and the pipeline is a typed dependency chain per feature:
research/reference (parallel entry points, at least one required) → adr → plan
→ exec → audit, with `.vault/index/{feature}.index.md` auto-generated as the
feature's document roster. A document is never freestanding — it is a position
in a feature's lifecycle. The CLI reinforces this: `vault add`'s own advisory
hint after creating research is "define an ADR ... --related <the research
stem>", and `vault check features` audits "feature tag completeness — missing
doc types". The current dialog's single-document framing is the mismatch, not
the proposal.

### Current create surface (authoring-surface ADR D5/D6, shipped 2026-07-12)

`frontend/src/app/left/CreateDocDialog.tsx` — one modal, three fields:
doc-type `<select>` over `CREATE_DOC_TYPES`, corpus-fed feature combobox
(free text creates a new feature implicitly, D6), title input. Chrome state in
`frontend/src/stores/view/createDocChrome.ts`; submission via `useCreateDoc`
→ `directWrite({operation: "create_document"})` (ledgered, D5). Entry points
all dispatch the one `left-rail:new-document` descriptor. What it lacks:

- No awareness of what the selected feature already contains (no coverage).
- No hierarchy gating — an ADR can be created for a feature with no research.
- No `related` cross-link is ever sent, although the field exists end-to-end.
- Language is document-first ("New document"), not feature-first.
- `exec` is offered as a plain type, but exec records are plan-derived
  scaffolds (`--step`/`--all-steps`, machine-filled placeholders) — creating
  one bare loses the step binding.

### Cross-linking is already plumbed end-to-end, unused by the UI

`DirectWriteCreateParams` carries `related?: string[]`
(`frontend/src/stores/server/authoring.ts:424`), the engine create operation
accepts it, and the core adapter forwards each entry as a validated
`--related` argv token (`engine/crates/vaultspec-api/src/authoring/core_adapter.rs:198`).
Core resolves stems/paths to quoted `[[wiki-link]]` frontmatter entries at
scaffold time. Auto-cross-linking therefore needs NO new wire surface for the
create path: the panel resolves "the feature's research stem(s)" client-side
from served data and sends them as `related`. Post-hoc linking of an existing
document additionally has the ledgered `frontmatter_edit` operation (its
payload already models `related`).

### Hierarchy enforcement today lives in skills, not in core or the engine

`vaultspec-core vault add adr` succeeds with no research present; the
research-before-ADR gate is skill/agent discipline (`vaultspec-adr` terminates
without research) plus the advisory `vault check features`. Neither the engine
direct-write path nor core validates lifecycle ordering. Consequence for the
design: a dashboard gate makes the GUI stricter than the CLI. That is
defensible (the GUI is the guided surface; the CLI remains the expert escape
hatch) but it is a deliberate divergence to record, and it should gate
ELIGIBILITY in the panel (which types are offered) rather than add a new
server-side refusal class that core itself does not have.

### Coverage data: the one genuinely missing piece, and it must be engine-served

The panel needs, per feature: which doc types exist (and their stems, for
linking), which are missing, and what the next pipeline step is. The client
corpus (`useEditorLinkingCorpus`, filter vocabulary) carries feature TAGS only.
Deriving coverage client-side by narrowing a listing violates two laws at
once: displayed/classification state must be backend-served (wire-contract),
and client narrows over capped/paginated slices are silently wrong. The
architecture-blessed shape is one new bounded projection in `engine-query`
over the `LinkageGraph` (which already indexes every doc's directory tag +
feature tag + stem), served on the query plane, consumed via one stores
query/selector, rendered by dumb chrome. `vault check features --json` exists
CLI-side, but routing it through `/ops/*` would grow the deliberately-frozen
two-verb whitelist — rejected by precedent (authoring-surface ADR
considerations); the engine can compute the same truth from its own graph,
read-and-infer.

### The pipeline's own asymmetries the UI must respect

- research and reference are PARALLEL entry points; either satisfies the
  ADR precondition. The gate is "research OR reference exists", not "research".
- adr requires research/reference; plan requires an ADR; audit requires
  executed work but may also OPEN a pipeline (audit-as-closeout vs
  audit-as-start per the framework rules) — so audit is a soft case, not a
  hard gate.
- exec records and phase summaries are NOT free-form creates: they are
  plan-derived (`vault add exec --step/--all-steps/--summary`) with
  machine-filled placeholders. The panel should either scope exec creation to
  a plan-step picker or defer exec to the plan surface entirely.
- A feature "exists" only when its first document materializes (D6, no
  provisional persistence) — "Add New Feature" therefore means "create the
  feature's FIRST document", and the eligible first types are research and
  reference (the two entry points).
- Multiple same-type documents per feature are legal (multiple audits with
  topic infixes; repeated research). Coverage is "which types present", not
  "one slot per type".

### Design option space for the ADR

Panel shape: (a) keep one modal, add coverage + gating; (b) staged flow —
step 1 select-or-create feature (with per-feature coverage rows), step 2 add
document with only ELIGIBLE types offered, next-step highlighted, links
pre-filled; (c) full wizard that scaffolds an entire feature set in one
submit. Option (c) contradicts the pipeline's nature — downstream documents
depend on upstream CONTENT (an ADR digests research findings), so batch
scaffolding fabricates empty ceremony; the framework scaffolds one phase at a
time. Option (b) matches the user's three verbs and the domain model.

Gating strictness: hard gate (ineligible types not offered / disabled with
reason) vs advisory (warning, still allowed). Related law: "remove a
non-capability rather than ship a permanently-disabled lie" — but a
hierarchy-disabled type is a STATEFUL affordance (it enables when the
prerequisite lands), which the actions plane models fine; showing the next
step disabled-with-reason is honest pipeline pedagogy where hiding it would
make the pipeline invisible.

Auto-linking policy: on create, `related` pre-filled with the feature's
newest upstream stem(s) (adr ← research/reference; plan ← adr; audit ← plan
or reviewed exec), editable before submit. Deterministic rule, engine-served
stems, no fuzzy matching client-side.

Naming: the surface reads feature-first ("Feature", "Add document to
<feature>", "Start a new feature"); "New document" remains the verb-level
label on entry descriptors. All internal vocabulary (doc_type ids, tier ids)
stays off-screen per the design-system labels law.

### Constraints carried forward from standing decisions

- One action descriptor per verb across menu/keymap/palette; the existing
  `left-rail:new-document` id and its entry points must keep working (or be
  deliberately renamed as a contract event on the descriptor plane).
- Store-selector law: coverage view derived in `useMemo` over raw slices.
- Every new engine accumulator/projection bounded at creation; the coverage
  projection memoizes on graph `generation` like every other projection.
- Creation stays on the ledgered direct-write path (create is `Applied`
  through the changeset ledger with provenance) — no new write seam.
- Wire responses carry `tiers`; the panel degrades honestly when the engine
  is degraded.

### Sources

- `frontend/src/app/left/CreateDocDialog.tsx` (whole file, current dialog)
- `frontend/src/stores/view/createDocChrome.ts` (chrome state + submission)
- `frontend/src/stores/server/authoring.ts:417-492` (create params, `related`)
- `engine/crates/vaultspec-api/src/authoring/operations.rs:259-336,775` (create materialization)
- `engine/crates/vaultspec-api/src/authoring/core_adapter.rs:70-245` (`vault add --related` argv)
- `vaultspec-core vault add --help`; `vaultspec-core vault check features --help` (CLI capabilities, 2026-07-14)
- Framework rules: `vaultspec.builtin.md` (tag taxonomy, pipeline table), `vaultspec-system.builtin.md` (phase requirements)
- Authoring-surface ADR D5/D6/D7 and its research (linked in frontmatter)
