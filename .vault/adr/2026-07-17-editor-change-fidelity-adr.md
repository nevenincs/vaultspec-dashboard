---
tags:
  - '#adr'
  - '#editor-change-fidelity'
date: '2026-07-17'
modified: '2026-07-17'
related:
  - '[[2026-07-12-authoring-surface-research]]'
  - '[[2026-07-16-agentic-authoring-ux-research]]'
  - '[[2026-06-29-agentic-change-format-and-chunking-adr]]'
  - '[[2026-06-29-agentic-changeset-ledger-adr]]'
  - '[[2026-06-29-agentic-concurrency-leases-conflicts-adr]]'
  - '[[2026-07-11-section-scoped-operations-adr]]'
  - '[[2026-07-12-authoring-surface-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-06-syntax-highlighting-adr]]'
---

# `editor-change-fidelity` adr: `agent/user edit reconciliation, provenance marking, and paragraph comments` | (**status:** `proposed`)

## Problem Statement

An agent team can now edit a document LIVE — propose, be approved (or ride
autonomy mode), and apply through the ledger — while the user holds an unsaved
draft of the same document in the transparent-textarea editor. Today that
collision is a dead end: the editor's draft is fenced on the opening
`blob_hash`, an agent apply lands a new base underneath it, and the user's next
save returns a `conflict` status with no path forward — the user must manually
copy their text out and re-open. Nothing in the buffer indicates which parts of
a document an agent changed, which are the user's own unsaved edits, or which
agent changes arrived unseen while the user was working. And although
section-anchored comments exist end-to-end (authoring-store table, four routes
plus SSE, exact-or-conflict anchors, orphan handling, thread panel), they can
only be composed from the reader's heading affordance, only at heading-section
granularity, and there is no document-level summary of them.

This ADR answers three questions for the editing-UX epic: (Q1) how agent and
user edit state reconciles, (Q2) how agent edits are marked inside the buffer
without visual bloat, and (Q3) how paragraph-level comments are added,
anchored, and summarized. It governs the sibling change-buffer and
change-marker work already queued for this feature.

## Considerations

- **The repo already owns a concurrency contract.** Agent edits are NEVER raw
  buffer mutations: they enter as durable changesets (preimage, materialized
  snapshot, review diff), apply under optimistic base checking with leases
  advisory-only, and a diff is a DERIVED review artifact, never authority
  (change-format + changeset-ledger ADRs). Section edits resolve
  EXACT-OR-CONFLICT via `SectionSelector` (`heading_path` +
  `expected_content_hash`; `range_hint` advisory-only), and the engine already
  has an explicit rebase seam (`authoring/rebase`): carry the drafted intent
  forward onto the current base, DENY on anchor drift, never fuzzy-patch and
  never silently mutate.
- **The client already mirrors the engine's section model byte-for-byte.**
  `sectionAnchor.ts` reimplements `parse_heading_sections` and `blob_oid`
  exactly (live-verified), so the frontend can partition any base or draft into
  the same sections the engine resolves — without new wire surface.
- **The editor is a client-held overlay, not a shared buffer.** The editor
  slice holds `draftText` / `baseText` / `baseBlobHash` as view-local state;
  every edit flows through one `setDraft` pipeline; saves are ledgered direct
  writes fenced on `blob_hash`. There is no gutter today (`HighlightedCode.tsx`
  is a transparent textarea over an aria-hidden `pre`).
- **A documented decision stands in the way and must be superseded, not
  silently contradicted.** The view store deliberately holds "a SINGLE draft
  string, NOT an append-only edit/undo history (which would be an unbounded
  accumulator)" and fixes `EditorStatus` as "a bounded, single-value enum —
  NOT an append-only history of states", both citing the resource-bounds
  rule. The owner-requested navigable change buffer contradicts that recorded
  choice; this ADR carries the superseding decision WITH its bounds (D10)
  rather than shipping a rule violation.
- **Reference postures.** VS Code: one authoritative versioned text model,
  edits as content-change deltas, decorations carried by sticky ranges
  (`DecorationRangeBehavior`) adjusted per delta, dirty-diff computed against a
  saved base and rendered as gutter marks. Zed: a true CRDT buffer
  (`text::Buffer`) with history-anchored positions (`Anchor` with left/right
  bias) that survive concurrent edits, because the buffer itself is the
  multi-participant collaboration substrate.
- **Owner constraint:** "simplicity and visual-bloat avoidance while
  giving the clues needed for the user to orient themselves" is critical.
- **Comments law already settled:** one comment store (authoring-state),
  anchors on the one `SectionSelector`, never store a client path (derive from
  `node_id`), orphans listed honestly and never silently re-anchored;
  paragraph-level anchoring was named a follow-on requiring a finer selector —
  this ADR is that follow-on decision.
- **Binding rules:** `app/` is dumb chrome and `stores/` the sole wire client;
  displayed/filterable state is backend-served; every accumulator bounded at
  creation; no deprecation bridges; no raw hex or hardcoded px; labels are
  plain language (no "rebase"/"selector"/"provenance" on screen).

## Considered options

**Q1 — reconciliation model:**

- **CRDT buffer (Zed posture).** Rejected. A CRDT solves convergence of
  concurrent keystreams from multiple live participants sharing one buffer.
  Our agents do not emit keystreams — they emit whole reviewed changesets
  through the ledger; the collaboration substrate here is the LEDGER, not the
  buffer. Adopting a CRDT would mint an enormous new contract (shared buffer
  identity across engine and client, replicated history, a second source of
  document truth beside the worktree) to solve a problem the product's own
  write grammar has already removed.
- **Operational transformation.** Rejected for the same reason plus its
  central-sequencer requirement; nothing in the system produces the concurrent
  operation streams OT exists to order.
- **Hard lock / defer (user editing blocks agent apply, or vice versa).**
  Rejected: the concurrency-leases ADR fixed leases as ADVISORY only; a hard
  lock would stall autonomy-mode applies and reintroduce the
  check-out/check-in ceremony the propose-then-approve grammar replaced.
- **Whole-document conflict-on-save (status quo).** Rejected as the only
  behavior: honest but maximally lossy — it forces a manual merge even when
  the user and the agent touched disjoint sections, which is the common case.
- **No new concurrency primitive: section-granular draft rebase over the
  existing seam — CHOSEN (D1/D2).** The ledger stays the sole agent write
  path; the user's draft is a client overlay reconciled deterministically at
  section granularity onto each newly applied base; same-section overlap is a
  typed, user-resolved conflict. This is the VS Code posture (authoritative
  versioned base + dirty overlay + delta-adjusted decorations), which fits
  this product; Zed's does not.

**Q2 — provenance marking:**

- **Durable per-span provenance persisted with the document or a sidecar
  store.** Rejected: the ledger already IS the durable provenance record
  (actor, changeset, preimage, timestamps per applied revision); duplicating
  it per-text-span would create a second authority and an unbounded store.
- **Badges / background tints / author avatars inline.** Rejected on the
  owner's bloat constraint and the design-system warmth rule (no decoration;
  contrast and diff legibility win).
- **Ephemeral in-buffer decorations over ledger-derived diffs, gutter-first —
  CHOSEN (D4/D5).**

**Q3 — paragraph comments:**

- **A second, finer anchor model (byte/AST ranges) or a second comment
  store.** Rejected: two anchoring authorities would fork the orphan
  machinery, and offsets-as-identity was already rejected by the
  section-scoped-operations ADR.
- **Heading-section anchor + optional paragraph sub-anchor on the ONE store —
  CHOSEN (D7):** the durable anchor and its exact-or-conflict/orphan
  semantics stay untouched; the paragraph locator is a subordinate refinement
  that degrades to section-level, mirroring the engine's own
  advisory-vs-resolution split (`range_hint`).

## Constraints

- **The engine hashes worktree bytes.** A comment selector or section fence
  authored from DRAFT bytes will not match the saved file; any anchor authored
  in the editor must be computed from the SAVED base (`baseText`), and a dirty
  target section makes anchoring honestly unavailable rather than quietly
  wrong (D8).
- **Correctness authority stays engine-side.** The client-side section rebase
  (D2) is a UX convenience over view-local state; the ledgered save fence
  (`blob_hash`) remains the sole apply authority. A rebased draft that races a
  second apply simply conflicts again and re-reconciles — the client never
  needs to be right, only honest.
- **Client/engine parser lockstep.** D2 and D7 lean on `sectionAnchor.ts`
  mirroring the engine parser exactly; that lockstep is already live-tested
  (`comments.live.test.ts`) and any engine parser change is a contract event.
- **Paragraph sub-anchor resolution must be backend-served** (wire-contract:
  displayed state is engine-served) — a schema migration plus read-projection
  change on the comments plane, cross-cutting but small.
- **Parent stability.** Everything this ADR composes is shipped and tested:
  the ledger, the section seam, the engine rebase module, the comment plane,
  `DiffView` (the one diff primitive), the client section parser. The one
  design-system gap is a missing "modified" diff token (D5) requiring a token
  and Figma addition.
- **Bounded structures.** The decoration set, the unseen-set, and the change
  buffer all carry explicit caps at creation; a document beyond cap degrades
  to unmarked (stated, not silent).

## Implementation

**D1 — No new concurrency primitive: the ledger is the only agent write path,
and the user's draft is a client-held overlay.** Agents never mutate the
user's buffer; they apply changesets that land a new SAVED base. "Live
concurrent editing" therefore reduces to exactly one event the editor must
handle: a new base revision (new `blob_hash`) arriving — via the existing
watcher/SSE generation-bump invalidation that already reaches the open
editor's content query (the document-edit-hardening re-ingest signal), or
via a stale-fence refusal on the user's
own save — while the editor holds a draft. The product posture is VS Code's
(authoritative versioned document + dirty overlay + base diff), not Zed's
(CRDT buffer as collaboration substrate): our collaboration substrate is the
changeset ledger.

**D2 — Reconciliation is a deterministic section-granular three-way rebase;
same-section overlap is a typed conflict; the user is NEVER silently
overwritten.** When a new base lands under an open editor, the client
partitions old base, new base, and draft into heading sections with the
existing mirrored parser and reconciles per section:

- *Draft clean (not dirty):* the buffer reloads to the new base; agent-changed
  sections receive provenance marks (D4/D5). Nothing is lost — there was no
  draft.
- *Dirty, disjoint sections:* the draft is rebased in place — every section
  the USER touched keeps the user's bytes verbatim; every section only the
  AGENT touched takes the new base's bytes; `baseText`/`baseBlobHash` swap to
  the new base so the next save fences correctly. The swap is announced (an
  editor status notice, plain language: "Updated with agent changes") and the
  incoming sections carry unseen marks (D5/D6) — visible, never silent.
- *Dirty, overlapping section(s):* NO merge is attempted. The user's draft
  buffer is preserved byte-for-byte; the affected section(s) enter a
  conflicted state marked in the gutter, an editor banner states that the
  agent changed a section the user is editing, and resolution is explicit per
  section via the one `DiffView` primitive (agent's applied version vs the
  user's draft version): keep mine / take theirs. Only after every conflicted
  section is resolved does the base swap and the save re-arm. This is the
  client-side symmetric image of the engine's own rebase law (carry intent
  forward; drift denies; explicit, never silent).

Non-heading edge material (frontmatter, preamble before the first heading) is
treated as one pseudo-section under the same three arms.

**D3 — The dead-end save-conflict is cut over, not bridged.** The existing
optimistic-concurrency seams are extended, never re-invented: `markConflict`
already retains the draft when the blob-hash base goes stale, and `markSaved`
already advances `editorBaseText` to the committed text so the diff base
tracks what is actually on disk. What changes: the `conflict` status arm
(today a red label with no path forward) is REPLACED by the D2 flow: a refused save triggers the same
reconcile against the just-fetched current base — disjoint drafts rebase and
re-save in one step; overlapping drafts drop into the D2 resolution surface.
No legacy conflict dead-end remains (no-deprecation-bridges).

**D4 — Provenance is two-tier: durable truth in the ledger, ephemeral
decorations in the buffer.** Durable provenance is already served — every
applied revision carries actor and changeset identity in the authoring plane;
this ADR adds NO persisted span store. The editor derives an in-memory,
bounded decoration set from (a) the dirty-diff of draft vs `editorBaseText`
— the diff base the store ALREADY maintains and advances on every save, so
markers need no new wire (user spans) and (b) the section/line diff of old base vs new base at each D2
reconcile (agent spans). Decorations anchor as offset ranges with per-edge
bias, transformed by every edit delta through the single `setDraft` pipeline
(the VS Code sticky-range model; Zed's anchor insight applied in miniature —
anchors survive because ALL edits flow through one pipeline). On a base swap
(D2) decorations are recomputed from the fresh diffs, never transformed
across the swap. The set is capped at creation; past cap the editor degrades
to unmarked with a stated notice.

**D5 — The visual grammar is gutter-first with restrained text rendering; no
badges, tints, or avatars.** The editor gains a scroll-synced gutter (the
change-marker work this ADR governs). One narrow marker track encodes five
states:

- *User unsaved edit (manual edit in progress):* solid bar — added lines in
  the `--color-diff-add` tone, modified lines in a NEW `--color-diff-modified`
  semantic token (an OKLCH-tier and Figma addition; today only add/remove
  exist), deletions as a compact remove-tone tick between lines.
- *Agent change, seen:* the same bar geometry at reduced emphasis (a muted
  variant of the same tokens) — orientation without noise.
- *Agent change, NEW (unseen):* the full-emphasis bar plus a small dot glyph;
  the only state that also gets inline text rendering — inserted agent text
  renders in the `text-diff-add` tone until acknowledged (D6), then settles to
  normal ink. Deleted agent text is not rendered inline; clicking a gutter
  mark opens an on-demand per-hunk popover reusing `DiffView` — the one diff
  grammar, on demand, not ambient.
- *Conflicted section (D2):* a distinct broken-tone gutter bar spanning the
  section, paired with the resolution banner.
- *Rejected:* a rejected proposal never applied, so it leaves NO trace in the
  buffer — rejected state lives in the Review queue and the agent transcript
  only. (A user reverting an applied agent section is just a new user edit
  and marks as one.)

Next/previous-change navigation enrolls as ActionDescriptors on the one
action plane; the read-only code viewer reuses the same gutter grammar for
its saved-vs-committed dirty diff where applicable.

**D6 — Unseen tracking layers a session cue over the EXISTING durable
acknowledgement plane; it invents no new read-state store.** The engine
already owns the durable half: an agent change applied through the user's own
explicit approval was seen at approval time, and the only truly unseeable
class — autonomy-mode applies — already carries the after-fact
acknowledgement record (`AfterFactAcknowledgementRecord` +
`acknowledge_after_fact` in the authoring store's `modes` repository, with
`acknowledgement_count` served on the applied-under-policy projection). So
UNSEEN is defined as: applied under policy AND not yet after-fact
acknowledged — backend-served truth. The editor layers one fine-grained,
bounded, client-session visit-set over it (keyed on document ref + applied
changeset revision, marked when gutter click or change-navigation lands on
the change, evict-oldest, honestly session-scoped) for in-buffer orientation
only. Acknowledging from the gutter dispatches the SAME after-fact
acknowledge verb the Review lane uses — one acknowledgement concept, not a
parallel one. Gap to close: the store verb currently has NO HTTP route (the
frontend only reads the count) — exposing it is a small route addition on the
existing authoring surface, not new state.

**D7 — Paragraph comments refine the ONE anchor; they never fork it.** The
durable comment anchor remains the `SectionSelector` on the one
authoring-store comments table — exact-or-conflict resolution, orphan
semantics, re-anchor flow all untouched. A comment MAY additionally carry an
optional paragraph sub-anchor: the content hash (`blob_oid`) of the target
paragraph's bytes within the section, plus an advisory paragraph index — a
nullable-column schema migration on the existing table, not a second store.
Resolution stays backend-served: the read projection, having resolved the
section, locates the paragraph by exact hash and serves a sub-anchor state
(located / moved) beside the existing anchor state. A moved or vanished
paragraph DEGRADES the comment to section-level display with a plain "the
paragraph this refers to changed" note — paragraph drift alone never orphans
a comment (the section anchor still holds), mirroring the engine's
advisory-vs-fence layering.

**D8 — Composing from the editor: caret-to-section, anchored to SAVED
bytes.** A comment action in the editor (one ActionDescriptor, enrolled on
the editor toolbar and context-menu planes) maps the caret offset to its
heading section and paragraph via the mirrored parser and opens the SAME
thread panel and compose box the reader uses — pre-anchored, with the
paragraph sub-anchor prefilled. Anchors are computed from `baseText` (the
saved base), because the engine fences against worktree bytes. If the caret's
section is dirty in the draft, the affordance renders disabled-with-reason
("Save your changes to comment here") — exact-or-conflict discipline over a
quietly-orphaning comment. No second compose surface, no second store.

**D9 — The comment summary is a projection of the existing complete listing;
no new store or route.** The per-document comment listing already serves the
COMPLETE bounded set; summarizing it is presentation. The existing orphaned
panel generalizes into one document-level "All comments" panel: comments
grouped by section in document order (order from the client anchor index),
open/resolved partition, each row jumping to its section and opening its
thread; orphaned comments remain their own labeled group. The editor/reader
gutter shows one comment glyph per commented section (count on hover),
joining the D5 gutter rather than adding a second margin track.

**D10 — The navigable change buffer SUPERSEDES the single-draft-string
decision, with its bounds declared at creation.** The view store's recorded
choice ("a SINGLE draft string, NOT an append-only edit/undo history";
`EditorStatus` "NOT an append-only history of states") was correct for the
surface it governed and is superseded HERE for the editing surface only —
its two source comments are revised at cutover to point at this decision.
The buffer complies with the resource-bounds rule the original comments
cite, by construction rather than by prohibition:

- *Coalescing at the source.* Keystrokes never enter the history
  individually: contiguous edits coalesce into one transaction, closed by a
  pause or an edit-type boundary — the mechanism both references use
  (VS Code pushes undo stops at pauses and word boundaries rather than
  per-keystroke entries and additionally caps its undo-redo service's
  per-resource memory; Zed groups edits into a transaction within a short
  grouping interval on its buffer history). Neither reference keeps an
  unbounded per-keystroke log; neither do we.
- *Explicit caps, evict-oldest.* The transaction list carries an entry cap
  AND a total byte budget fixed at creation; breaching either evicts the
  OLDEST transactions first. The cost is stated, not silent: the user loses
  the deepest undo steps and the change-navigation stops at the eviction
  horizon — never a crash, never unbounded growth.
- *In-memory only, one durability story.* The buffer is session state,
  discarded on editor close and scope swap, never persisted and never a
  second durability plane: durable truth remains the saved base plus the
  ledger, exactly as the decoration set (D4) and the visit-set (D6) already
  declare. `draftText` remains the single authoritative draft string the
  save path reads; the buffer is a bounded HISTORY BESIDE it, not a
  replacement authority.

**D11 — Agent marks survive user edits by per-edit RECLASSIFICATION over the
retained raw baseline; there is no stored, transformed decoration state.**
(Addendum, closing the D4 crux; supersedes the V1 clear-on-first-keystroke
behavior as a full cutover, not a flagged bridge.) The anchor is not a range
the client stores and transforms — it is a derivation the client repeats. The
store keeps only the raw strings it already holds (`draftText`,
`editorBaseText`, `editorAgentBaseline`); the app derives the effective change
set per render:

- `baseDiff = diffLines(editorBaseText, draftText)` — already computed for the
  user marks today; the user runs come from `classifyDiff(baseDiff)` unchanged.
- The agent runs come from `deriveAgentChanges(editorAgentBaseline,
  editorBaseText)`, memoized on that pair — it changes only at a reconcile,
  never per keystroke.
- A line-space projection built from the SAME `baseDiff` walk (context lines
  advance both counters; adds advance draft-space; removes advance base-space)
  maps each agent run from base-line space into draft-line space.
- Merge law: a user run wins every line it touches. An agent run that projects
  onto untouched context keeps `agent` origin (and its `unseen` cue); an agent
  line the user edited or deleted RECLASSIFIES as a user change — touching
  agent text makes it yours, which matches the ledger's provenance truth (the
  user's next save is the user's revision).

Store deltas (primitive-only, all in `viewStore.ts`): `setDraft` DELETES its
`editorAgentBaseline: null` clear arm (the cutover); `reconcileEditorBase`
keeps the OLDEST baseline across stacked applies
(`state.editorAgentBaseline ?? state.editorBaseText`) so marks compose across
successive applies instead of resetting to the last; `markSaved` clears
`editorAgentBaseline`/`editorAgentSeen` — a save folds the buffer into one
committed revision whose durable provenance is the ledger (D4). Stated cost:
saving before acknowledging drops the session-scoped dot; the durable unseen
truth remains the backend acknowledgement plane (D6).

Bounds: nothing is accumulated — two diffs per derivation, both under the
existing `MAX_DIFF_LINES`/`MAX_DIFF_CELLS` honest-degrade caps, one of them
memoized on a reconcile-frequency pair. Touch points: `editorChanges.ts` gains
`lineSpaceProjection(diff)` + `deriveEffectiveChanges(agentBaseline, baseText,
draftText)`; `MarkdownDocView.tsx` swaps its effective-change memo and the
nav thunk's `changesFromState` onto the new derivation; `HighlightedCode.tsx`
is untouched (same `LineMarker` grammar).

Rejected alternatives:

- *Transformed offset ranges (VS Code `IModelDeltaDecoration`).* VS Code's
  stickiness works because its text model EMITS content-change deltas; a plain
  textarea `onChange` yields only the new string, so the delta would have to be
  inferred by diffing old-vs-new draft anyway — sticky ranges then add a
  mutable decoration accumulator (its own cap, its own invalidation) on top of
  the very diff that already answers the question. Failure mode: a mis-inferred
  delta (paste-over-selection, IME composition, undo, autocorrect — each one
  `onChange` event with multi-span effects) silently drifts a provenance mark
  onto text the agent never wrote: a lying decoration, worse than none.
- *Content-keyed recovery (re-find agent lines by content in the draft).*
  Duplicate lines (blanks, list bullets) re-anchor to the wrong occurrence,
  and an intra-line user edit either loses the mark or cannot distinguish
  user-touched from vanished. Failure mode: nondeterministic anchoring.
- *Adopting CodeMirror/Monaco for native decorations.* Replaces the
  transparent-textarea overlay architecture (syntax-highlighting ADR)
  wholesale — a view rewrite and contract event outside this epic.

**D12 — The D2 dirty arm ships as an app-computed section three-way over the
mirrored parser; the store holds one primitive pending base plus a decisions
record; overlap resolves per-section through the ONE `DiffView`.** The
existing reconcile effect in `MarkdownDocView.tsx` becomes the single
dispatcher: when the served hash diverges from `baseBlobHash`, a CLEAN draft
takes `reconcileEditorBase` exactly as today (its clean-only guard stays, and
doubles as the race backstop); a DIRTY draft runs a new pure app module
`app/authoring/sectionReconcile.ts` built on `parseHeadingBlocks` over
(old base = `editorBaseText`, new base = the served text, draft =
`draftText`). The save-refusal entry (D3) converges here too: `markConflict`
→ content refetch → the same dispatcher.

- *Partition.* Flat segments cut at EVERY heading boundary; the pseudo-section
  is bytes 0 → first heading (frontmatter + preamble), keyed
  `headingPathKey([])`. `HeadingBlock` gains a client-only `start` offset —
  additive; the parse logic stays byte-identical to the engine, so parser
  lockstep is untouched.
- *Classification per segment key.* `userTouched` = draft bytes differ from
  the old base's (or the segment is added/removed by the draft); `agentTouched`
  = new-base bytes differ from the old base's (same test). Agent-only takes
  the new base's bytes; user-only or untouched keeps the draft's bytes
  verbatim; BOTH is a CONFLICT. Deny-to-conflict also covers every ambiguity,
  mirroring the engine's `carry_forward_drafts` AnchorDrift law
  (`authoring/rebase/mod.rs`: preserve the drafted intent, re-materialize
  against the current base, and DENY drift as a value rather than guess):
  duplicate segment keys in any of the three images, a user-added segment
  whose preceding anchor segment vanished, and user-deleted vs agent-modified
  (either direction). Merged order follows the NEW base; user-added segments
  re-insert after their nearest preceding surviving segment.
- *Disjoint arm.* The app computes the merged draft; a new store action
  `rebaseDraft(mergedDraft, newBaseText, newBlobHash)` swaps draft, base, and
  fence in one atomic set, keeps status `dirty`, retains the oldest
  `editorAgentBaseline` (D11 then marks the incoming sections), and the editor
  announces "Updated with agent changes". When the entry was a refused save,
  the held save intent retries ONCE after the rebase — D3's
  "rebase and re-save in one step".
- *Overlap arm.* NO merge. New primitive store fields:
  `editorPendingBaseText: string | null` and
  `editorPendingBaseBlobHash: string` (the held new base — single values, the
  same bounded class as `editorAgentBaseline`), plus
  `editorConflictResolutions: Record<string, "mine" | "theirs">` (per-segment
  decisions keyed on the segment path key). The conflicted-section SET is NOT
  stored — it is derived live in the app from (old base, pending base, current
  draft) by the same memoized reconcile, so it stays honest while the user
  keeps typing: an edit can dissolve a conflict (they took theirs by hand) or
  surface a new one, and the buffer never locks. Actions:
  `holdPendingBase(newBaseText, newBlobHash)` (status becomes `conflict`; the
  draft is untouched byte-for-byte), `resolveConflictSection(key, choice)`
  (prunes decisions to currently-derived keys), and
  `completeConflictReconcile(mergedText)` — invoked by the app only when every
  derived conflict key has a decision; it sets draft = merged image, base =
  pending base, fence = pending hash, clears the pending fields, retains the
  oldest agent baseline, and re-arms status (`dirty` when the merge diverges
  from the new base, else `idle`). While `editorPendingBaseText` is non-null
  the save path is STRUCTURALLY disabled (save thunk guard + disabled
  control), so a silent overwrite is impossible by construction, not by
  discipline. A NEWER apply while a conflict is pending replaces the pending
  base and the derived set recomputes; prior decisions are DROPPED with a
  notice — a decision taken against superseded bytes is not consent to
  different bytes.
- *Presentation.* Conflicted segments take the D5 broken-tone gutter bar and
  the one banner ("An agent changed a section you're editing"); the
  resolution surface lists the conflicted sections, each opening the ONE
  `DiffView` (the user's section bytes vs the new base's section bytes) with
  two plain actions: "Keep my version" / "Use the agent's version".
  `DiffViewSource` gains one value (`conflict-resolution`) — a
  parameterization of the one primitive, never a second diff grammar.
- *Authority.* Unchanged: the ledgered save fence (`blob_hash`) remains the
  sole apply authority. The client three-way is a UX convenience over
  view-local strings; its worst outcome is another honest conflict, never a
  lost byte.

Rejected alternatives:

- *Line/hunk-granular auto-merge (git-style).* Silently fuses adjacent edits
  inside one section — exactly the silent-mutation class the concurrency ADR
  and the engine's deny arc forbid. Failure mode: plausible merged prose
  nobody wrote.
- *Whole-document conflict only (status quo).* Loses the common disjoint
  case; forces the manual copy-out this ADR exists to end.
- *Store-side section computation.* Requires importing the app parser into
  `stores/` (layer violation) or duplicating it (a second lockstep hazard).
  The app computes; the store holds primitives.
- *Modal lock until resolution.* Blocks typing in untouched sections for no
  safety gain; per-section conflict state with a live-derived set keeps the
  buffer editable while remaining un-overwritable.

**D13 — Boundary and rule sanity for D11/D12.** (a) *Layer law:* every new
store field is a string or a record of string literals; parsing, diffing, and
merging live in `app/authoring/` (`editorChanges.ts`,
`sectionReconcile.ts`) — `stores/` imports no app type. (b) *Resource
bounds:* the pending base is a single value (the same class as
`editorAgentBaseline`); the decisions record is pruned to the derived
conflict set, itself bounded by the parser's `MAX_HEADING_SECTIONS`; all
diffs ride `MAX_DIFF_LINES`/`MAX_DIFF_CELLS`; if a diff caps or the partition
is ambiguous document-wide, the reconcile degrades to ONE whole-document
conflict — stated, coarser, never silent. (c) *No deprecation bridges:*
`setDraft`'s clear-on-keystroke arm and the conflict dead-end arm are
DELETED, not flagged. (d) *Design system:* no new colour (the D5 grammar and
its tokens are reused, including the broken-tone conflict bar); every label is
plain language; "rebase", "selector", "baseline" never render. (e) *Reviewed
events to flag:* the view-store shape addition (three fields, four actions,
two action-semantics changes) is the one deliberate store-contract change and
is reviewed BY this addendum; `DiffViewSource` plus one value and
`HeadingBlock.start` are additive client-only widenings; D11/D12 require NO
engine or wire change — the un-served acknowledge verb (D6) remains the
epic's only wire item and is unaffected.


## Rationale

Every hard sub-problem here already has a settled in-repo answer; the
decisions compose them rather than minting new machinery. Q1's answer is
dictated by the write grammar: because agents can only reach a document
through reviewed, whole-section-materialized changesets, there are no
concurrent keystreams to converge, and a CRDT/OT layer would be contract mass
with no producer — while the section seam plus a client-side rebase gives
lossless reconciliation for the common disjoint case and honest,
user-resolved conflicts for the rest. The engine's own rebase module proves
the philosophy at the other end of the wire: preserve intent, re-base
explicitly, deny on drift. Q2 keeps durable provenance where it already lives
(the ledger) and spends exactly one new UI element (the gutter) plus one
token on orientation, satisfying the owner's bloat constraint with VS Code's
proven decoration mechanics. Q3 refines the one anchor model the comments
plane already trusts, keeping one store, one orphan machinery, one compose
surface — the paragraph hash is to the section anchor what `range_hint` is to
`heading_path`: subordinate evidence, never a second authority.

## Consequences

- **Gains.** The agent/user collision stops being a dead end: disjoint edits
  merge losslessly and automatically, overlaps resolve explicitly through the
  one diff grammar, and the user's text is structurally incapable of being
  silently overwritten. The buffer finally answers "what changed, who did it,
  what's new" at a glance. Comments gain paragraph precision, an editor entry
  point, and a document-level summary with zero new stores.
- **Costs.** The editor grows real machinery: a gutter scroll-synced to the
  overlay, a decoration set with delta transformation, a bounded edit-history
  buffer superseding a documented single-draft decision (D10), a reconcile
  state machine — all client-side and bounded, but a genuine testing surface. The
  comments plane takes a schema migration and a projection change. One new
  semantic token (`--color-diff-modified`) must land in the OKLCH tier and
  Figma before the marker work ships.
- **Pitfalls.** Parser lockstep is load-bearing twice over (rebase
  partitioning and comment anchoring); an engine-side section-parser change
  without the client mirror is a silent-corruption class and must be treated
  as a reviewed contract event. Section-granular rebase is only as fine as
  the document's headings — a heading-poor document degrades toward
  whole-document conflict behavior (honest, but coarser). Unseen state is
  session-scoped; users who reload lose the "new" cue (accepted V1 bound).
- **Pathways.** The decoration seam is where a future live token-stream
  preview (the a2a relay) would render an in-flight agent edit before apply;
  the paragraph sub-anchor is the natural base for future inline-span
  comments if a finer selector is ever justified; the reconcile state machine
  is the seam a future queued-turn or multi-agent concurrency story plugs
  into without touching the ledger contract.

## Implementation status (2026-07-17)

Every decision is IMPLEMENTED and committed to the local `main` branch (unpushed),
each with tests:

- D1–D6 (syntax themes, bounded diff, editor gutter, change navigation, agent
  provenance, read-only code markers) — the modern-editing core for both surfaces.
- D11 (anchor stability) — `deriveEffectiveChanges` re-projects agent marks per
  render; the V1 clear-on-keystroke is cut over.
- D12 (dirty-overlap reconcile) — `app/authoring/sectionReconcile.ts` section
  three-way; disjoint auto-rebases, overlap holds the base and resolves per-section
  through the one `DiffView` (`conflict-resolution` source); the user is
  structurally never silently overwritten.
- The `acknowledge_after_fact` HTTP route (D6 durable half) is now served
  (`POST /authoring/v1/proposals/{changeset_id}/acknowledge`) and wired into the
  Review lane.

## Open questions (for the owner)

- **`--color-diff-modified` Figma sync (the one outstanding item).** The token is
  live in code (OKLCH tier + `styles.css`, contrast-proven) and recorded here; the
  Figma variable is NOT yet added because the binding file was not reachable via the
  MCP headless. EXACT one-step spec: add semantic variable `diff-modified` beside
  `diff-add`/`diff-remove` in the same collection + modes — light `oklch(0.5 0.13
  250)`, dark `oklch(0.72 0.13 250)`, high-contrast `oklch(0.8 0.15 250)`. A
  documented code-first divergence, permitted by the design-system rule pending the
  sync.
- **Auto-save-then-comment:** D8 disables commenting on a dirty section
  rather than auto-saving first; owner ruled DISABLE-with-reason (2026-07-17).
