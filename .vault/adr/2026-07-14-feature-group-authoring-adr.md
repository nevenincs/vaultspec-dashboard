---
tags:
  - '#adr'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-feature-group-authoring-research]]"
  - "[[2026-07-12-authoring-surface-adr]]"
---

# `feature-group-authoring` adr: `feature-group document creation` | (**status:** `accepted`)

## Problem Statement

The New-document dialog treats creation as an isolated (type, feature, title)
triple: it does not know what the chosen feature already contains, offers
every document type regardless of pipeline position, never writes a
cross-link, and speaks document-first language for what the framework defines
as a feature-lifecycle act. The user directed a holistic redesign: frame the
surface — in language and architecture — as managing the contents of a
feature group (start a new feature; select an existing feature; add a
document to it), enforce the pipeline hierarchy (no ADR without upstream
research/reference), and cross-link automatically. This ADR narrowly amends
the authoring-surface ADR's D5/D6: the entry descriptors and ledgered create
path stand; the dialog's single-document shape and implicit-only feature
creation are replaced.

## Considerations

- The framework's own model is feature-first: every document carries exactly
  one feature tag, the pipeline is a typed per-feature dependency chain
  (research/reference → adr → plan → exec → audit), and the CLI already
  audits per-feature completeness (`vault check features`) and advises the
  next step after every `vault add`.
- Cross-linking is plumbed end-to-end and unused: the create operation's
  `related` field flows through the ledger to core's `--related`, which
  resolves stems to wiki-links at scaffold time. No new write surface needed.
- Displayed/classification state must be engine-served (wire-contract law);
  per-feature coverage derived by client-narrowing a capped listing would be
  silently wrong. The blessed shape for new read state is one projection in
  `engine-query` + one stores query + dumb chrome.
- Neither core nor the engine enforces lifecycle ordering today; the gate
  lives in skills. A panel gate makes the GUI stricter than the CLI — a
  deliberate divergence to record, not to hide.
- exec records are plan-derived scaffolds (`--step`, machine-filled
  placeholders); a bare exec create loses the step binding.
- research and reference are parallel entry points (either satisfies the ADR
  precondition); audit may legally OPEN a pipeline; multiple same-type
  documents per feature are legal.
- Standing laws: one action descriptor per verb; no provisional-feature
  persistence (a feature exists when its first document materializes);
  store-selector rawness; bounded projections memoized on graph generation;
  plain-language labels.

## Considered options

- **Patch the existing modal** (add a warning banner, keep flat fields) —
  rejected: leaves the document-first frame, the coverage blindness, and the
  exec footgun intact; the user asked for the reframe, not a patch.
- **Full feature-set wizard** (one submit scaffolds research+adr+plan+…) —
  rejected: downstream documents digest upstream CONTENT (an ADR digests
  research findings); batch scaffolding fabricates empty ceremony the
  framework's one-phase-at-a-time design deliberately avoids.
- **Coverage via `/ops/*` passthrough of `vault check features`** — rejected:
  grows the deliberately-frozen two-read-verb whitelist; the engine can
  compute the same truth from its own graph, read-and-infer.
- **Client-derived coverage** over the vault-tree listing — rejected:
  violates the backend-served-state law and breaks under caps/pagination.
- **Server-side hierarchy refusal** (engine denies an out-of-order create) —
  rejected: makes the wire stricter than core with a new denial class nothing
  else has; eligibility is presentation-plane guidance, and the CLI remains
  the expert escape hatch.
- **Staged feature-first panel over an engine-served coverage projection
  (chosen)** — select-or-create feature, see the group's pipeline state, add
  only eligible documents with links pre-filled.

## Constraints

- No provisional-feature persistence (carried from the authoring-surface
  ADR): "start a new feature" means creating the feature's FIRST document;
  until it lands the feature exists only as panel draft state.
- The coverage projection reads the same scope-bound corpus the graph serves;
  a feature's coverage is per-workspace-scope, and the panel must read the
  per-tab/workspace scope seam, never ambient scope.
- Core's stem naming (`{date}-{feature}-{doc_type}.md`) permits one same-type
  document per feature PER DAY without `--force`; a second same-day create of
  an existing type must surface core's refusal honestly, not mask it.
- The `related` pre-fill can only name documents the engine has already
  observed; immediately after a create lands there is watcher/re-ingest
  latency before coverage reflects it. The panel refreshes coverage from the
  create receipt's invalidation, and the linking rule tolerates the gap
  (pre-fill is editable, never silently wrong).
- Hierarchy gating is UI-level policy: agents and the CLI bypass it by
  design. The panel is pedagogy and guard-rail, not an integrity boundary.
- Approval condition (user, 2026-07-14): the panel is DESIGNED IN FIGMA
  before any frontend rollout. Figma is the binding source of truth
  (design-system law); the panel's frames land in the design file and code
  mirrors them. Implementation ordering: engine projection work may proceed
  in parallel, but no panel chrome ships ahead of its approved Figma frames.

## Implementation

**D1 — The surface is a feature-group panel.** One dialog, two stages, one
shared action id (the existing new-document descriptor, relabeled
feature-first). Stage 1 — feature: the corpus-fed combobox
selects-or-creates a feature (free text preserved); beneath it the selected
feature's pipeline state renders as coverage rows (present types with their
newest stem, missing types, the advised next step). Stage 2 — document: a
type choice restricted to ELIGIBLE types, title, and an editable pre-filled
related-links row; submit stays the existing ledgered create mutation.
Feature-scoped entry points (Features-section affordance, tree context menu)
open the panel with stage 1 pre-answered.

**D2 — Coverage is one engine projection.** A bounded per-feature
feature-coverage projection in `engine-query` over the LinkageGraph: for a
requested feature (or the compact all-features roster), the present directory
types each with newest stem, the missing types, and a served `next_step`
token. Memoized on graph `generation`, computed over the full pre-truncation
corpus, served on the query plane with the standard envelope, consumed by one
stores query keyed on scope+feature.

**D3 — Eligibility is served, gating is presentational.** The projection
serves per-type eligibility (`research`/`reference` always; `adr` requires
research or reference present; `plan` requires adr; `audit` always eligible
with an advisory note when nothing upstream exists — audit legally opens a
pipeline). The panel renders ineligible types disabled with the reason and
the one-click path to the prerequisite ("Create the research document
first"), keeping the pipeline visible rather than hiding it. Engine and core
refuse nothing new.

**D4 — exec leaves the free-form panel.** exec records are plan-derived; the
panel stops offering bare exec creation (a removed non-capability, not a
disabled lie). Scaffolding step records from the plan surface (step picker →
`--step`) is a named follow-on on the plan-interior plane.

**D5 — Cross-links are pre-filled deterministically.** From served coverage:
adr ← the feature's newest research and reference stems; plan ← newest adr;
audit ← newest plan (when present); research/reference ← none. The pre-fill
renders as editable link chips before submit and is sent through the existing
`related` create param; core materializes the wiki-links. No client fuzzy
matching, no new wire field.

**D6 — Language is feature-first and plain.** Panel title and verbs speak
feature-group management ("Start a new feature", "Add a document to
<feature>"); doc types render plain-language labels with the pipeline order
visible; internal ids (`doc_type` tokens, next-step tokens) stay off-screen.
Entry descriptors keep their ids; their labels are relabeled once on the
descriptor plane so menu, palette, and keymap legend agree.

## Rationale

The research established that the framework already defines a document as a
position in a feature's lifecycle — the flat dialog was the anomaly. Every
mechanism the reframe needs short of one read projection already exists: the
ledgered create path, the `related` plumbing to core's own wiki-link
resolution, the corpus-fed feature vocabulary, and the descriptor plane. The
one genuine gap (per-feature coverage) has exactly one law-compliant home:
an engine-query projection over the graph the engine already holds, bounded
and generation-memoized like its peers. Gating at the presentation plane
mirrors where the framework itself enforces hierarchy (skills, not core),
records the GUI-stricter-than-CLI divergence honestly, and avoids inventing
a wire denial class. The staged panel realizes the user's three verbs without
the batch-scaffold trap: it manages the group while still creating one
honest document per act, exactly as the pipeline intends.

## Consequences

- Users see the pipeline: selecting a feature shows what exists, what is
  missing, and what comes next, and new documents land pre-linked — the
  feature graph stops accreting orphan documents from the GUI path.
- Net-new engine surface: one projection + route + tests, plus its stores
  query. Bounded, read-only, re-derivable — but real work and a real review
  surface.
- The dialog rewrite touches guard tests (new-document affordances, palette
  coverage) and the createDocChrome store shape; entry-point ids survive so
  keymap/palette/menu enrollments do not churn.
- Removing bare exec creation is a small capability regression for anyone
  who used it; the plan-surface step scaffold follow-on restores it properly.
- The GUI is now deliberately stricter than the CLI; agents bypassing the
  panel still create out-of-order documents that `vault check features`
  flags — the panel improves the human path, it does not close the gap.
- Watcher latency between a create landing and coverage reflecting it is
  visible in the panel for a beat; the receipt-driven invalidation bounds it.
