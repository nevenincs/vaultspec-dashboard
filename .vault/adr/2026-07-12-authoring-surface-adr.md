---
tags:
  - '#adr'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-authoring-surface-research]]"
  - '[[2026-07-09-ledgered-edit-migration-adr]]'
  - '[[2026-07-11-section-scoped-operations-adr]]'
  - '[[2026-06-18-editor-dock-workspace-adr]]'
---

# `authoring-surface` adr: `surface every authoring capability: plan ticks, document comments, in-editor diff, visible create actions` | (**status:** `accepted`)

## Problem Statement

A usefulness survey found the authoring backend complete but under-surfaced: the
ledgered direct-write path, the changeset review station, and the plan/pipeline
projections all exist, yet the UI offers no way to tick a plan step, no
comments/notes capability of any kind, no in-editor diff, no visible create
affordance anywhere in the chrome, and a bare free-text feature input in the
create dialog. The user directed a comprehensive epic to close these gaps with
modern authoring UX (block-level comment affordances, touch/click/keyboard
parity in reading mode). This ADR records the architecture for that epic; the
grounding survey is the same-feature research document.

## Considerations

- The ledgered-edit migration deleted the legacy un-ledgered write path and set
  the boundary test: a single-document edit belongs on the ledger with
  provenance and rollback; only non-document-edit maintenance stays outside.
- Plan documents may only be structurally mutated through the canonical
  `vault plan` CLI verbs (identifier preservation); the engine never hand-edits
  plan markdown, and served step state (`done`) derives from re-ingest, so a
  tick must materialize through core and be re-observed, never written into
  engine caches.
- The `/ops/*` core passthrough whitelist is deliberately two READ verbs; verbs
  are sibling filings, not whitelist growth.
- The authoring-state SQLite store is the one sanctioned non-derivable home
  (ledger, idempotency, retention, actor provenance already live there);
  engine-data must stay fully re-derivable.
- The section-scoped-operations selector (heading path + advisory range hint +
  expected content hash, exact-or-conflict) already models "anchor into a
  document that may drift".
- Frontend laws: one action descriptor per verb across menu/keymap/palette;
  centralized kit + tokens; Lucide structural icons; hover is invisible on
  touch (compact gets explicit tap targets via the viewport class); formatting
  accelerators stay toolbar-only (standing review CRITICAL: they collide with
  the palette and rail chords).
- Actor identity is a single shared principal in V1 (per-human sign-in is a
  documented return trigger elsewhere); comment attribution must not pretend
  otherwise.

## Considered options

- **Plan tick via `/ops/*` whitelist growth** — mechanically ~4 lines; rejected:
  reintroduces the un-ledgered per-document write the migration ADR deleted.
- **Plan tick via ledgered plan-step capability (chosen)** — one new core
  capability + changeset operation kind + post-verify; full history/rollback.
- **Plan tick as full review-ceremony changeset** — rejected for V1: a checkbox
  carries no reviewable prose diff; the direct-only self-approved kind exists
  for exactly this shape.
- **Comments as vault documents** — rejected: needs new core verbs, pollutes
  the related-links/feature-index planes, heavyweight template validation.
- **Comments in engine-data** — rejected: comments are not re-derivable.
- **Comments in the authoring-state store, section-anchored (chosen).**
- **Provisional feature as served state** — rejected for V1: net-new wire
  surface (projection union) for a state the create dialog can hold client-side.
- **Block anchors from source line ranges** — rejected as persistent identity
  (stale on any upstream edit); line data may serve display-only highlighting.
  Heading-path anchors chosen.

## Constraints

- The plan CLI verb carries no expected-blob-hash fence, unlike every other
  ledgered write: optimistic concurrency for a plan tick is enforced only
  engine-side (compare the held base against the current worktree read before
  invoking core). This is a stated, weaker guarantee; core-side fencing is a
  filed upstream ask, not something to patch around.
- Subprocess timeout/output-cap breaches stay outcome-indeterminate; the
  plan-tick post-verify (re-read the step's checkbox state through core) is the
  resolution path.
- Comment anchoring inherits heading-section granularity from the section
  selector: V1 comments attach to heading sections, not arbitrary spans. Inline
  or sub-paragraph anchoring requires a finer selector — an explicit non-goal.
- Single-principal attribution: every V1 comment records the shared editor
  actor ref; the model carries the ref so attribution upgrades in place when
  per-human identity lands.
- The executor must confirm the plan verb's JSON status vocabulary maps onto
  the adapter's success set, or widen the mapping.

## Implementation

**D1 — Plan-step tick rides the ledger.** A new plan-step-set-state capability
in the internal core adapter invokes `vault plan step check` / `uncheck` (path +
`S##` from the plan-interior projection), enrolled as a new changeset operation
kind materialized like rename/frontmatter operations, riding a direct-only
self-approved changeset with provenance. Engine-side concurrency fence before
invocation; core-authoritative post-verify re-reads the resulting step state.
The watcher re-ingest flips the served `done`; the frontend mutation invalidates
the plan-interior query and renders the in-flight state until it lands. The
`PlanStepTree` step rows gain a real checkbox (keyboard-operable, part of the
row's focus zone), disabled outside the present view. No ops whitelist change.

**D2 — Comments are authoring-state entities anchored to heading sections.** A
comments table in the authoring store (doc ref, section selector JSON, body,
author actor ref, created/updated stamps, resolved flag), with bounded
per-document list reads and create/edit/resolve/delete mutations on the
authoring HTTP surface, evented over the existing authoring SSE channel.
Anchors resolve exact-or-conflict on read: a content-hash mismatch or missing
heading serves the comment as orphaned (still listed, marked stale, offering
re-anchor-to-current or resolve) — never silently re-anchored. Reader side: one
remark plugin attaches heading-path block ids; a heading wrapper renders the
right-side comment affordance (hover-revealed on pointer, always visible on
compact) plus a comment-count chip per commented section; a comment thread
panel opens anchored to the section. All verbs are action descriptors on the
unified plane.

**D3 — Reading-mode parity polish.** Accelerator hints surfaced on the View/Edit
toggle segments; a copy-link action descriptor on the vault-doc plane (copies a
deep link to the document, with heading anchor when invoked from a block);
block affordances from D2 give reading mode its per-block verb. Formatting
stays toolbar-only.

**D4 — In-editor diff.** The editor slice retains the opening text as
`baseText`; a toggle-diff action + toolbar button mounts the existing pure
diff-lines view as a collapsible section above the textarea (draft vs saved,
client-side). When the ledgered pre-save changeset exists, the same surface can
key on it without UI change.

**D5 — Visible create actions.** The workspace empty state gains a New-document
button; the browser-region header gains a Plus icon button (vault mode);
tree section headers optionally gain scoped Plus buttons. Every one dispatches
the existing new-document action descriptor — no bespoke handlers.

**D6 — Feature creation stays implicit; the input gets smart.** The create
dialog's feature field becomes the corpus-fed autocomplete combobox (free text
preserved — typing a new tag creates the feature with its first document). A
"new feature" affordance on the Features section pre-focuses that field. No
provisional-feature persistence in V1: a feature exists when its first document
materializes.

**D7 — Right-rail cruft deleted.** The unmounted `Inspector`, `NowStrip`, and
`DocHeader` components (superseded by the status tab) are removed with their
tests.

## Rationale

The research established that every write seam this epic needs either already
exists (direct-writes, section selector, actor tokens, diff view, action plane)
or has exactly one home consistent with standing law (plan ticks on the ledger
by the migration ADR's own boundary test; comments in the authoring store as
the only non-derivable home; anchors on the section selector rather than a
second anchoring model). The UX decisions follow the established platform
patterns: viewport-class-switched affordances (hover vs explicit tap targets),
one descriptor per verb, kit-composed chrome. The rejected options each violate
a settled decision (whitelist growth vs ledgered-edit migration; comments as
documents vs core verb scope; served provisional features vs wire minimalism).

## Consequences

- Users can finally drive the pipeline from the dashboard: tick steps, comment
  on sections, review their own diff before saving, and create documents and
  features from visible chrome — with history and rollback intact.
- The comments plane is net-new durable state: it needs bounds (per-document
  and per-store caps, retention), migration versioning, and honest orphan
  handling — all inherited patterns from the authoring store but real work.
- Plan ticks get a weaker concurrency fence than other ledgered writes until
  core grows an expected-hash flag for plan verbs (upstream ask to file).
- Heading-section comment granularity will disappoint span-level expectations;
  the finer selector is a named follow-on, not scope creep.
- Single-principal attribution means comments are functionally "notes to the
  project", not multi-user discussion, until sign-in lands; the schema carries
  the actor ref so no migration is needed then.
- The reader gains its first interactive per-block chrome; the remark plugin
  must not regress render performance on large documents (bounded work per
  block, no layout thrash on hover).
