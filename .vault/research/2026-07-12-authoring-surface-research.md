---
tags:
  - '#research'
  - '#authoring-surface'
date: '2026-07-12'
modified: '2026-07-12'
related: []
---

# `authoring-surface` research: `complete document authoring, creation, and review UX`

Survey of every gap between the dashboard's built authoring backend and what the
UI actually surfaces, directed by a user usefulness review. Six threads: plan-step
tick from the UI, a comments/annotations plane (block-level affordances), reading-mode
toggleable actions, in-editor diff, feature lifecycle (including provisional
features), and visible dock/rail create actions. Grounding events preceding this
research: the New-document dialog had been orphaned since the stage nav bar
retired (fixed in commit `95c01f8bc6` — rebuilt as `CreateDocDialog` on the shared
`Dialog` primitive, mounted per shell branch); `Inspector`, `NowStrip`, and
`DocHeader` in `app/right/` are unmounted cruft superseded by `StatusTab`.

## Findings

### Baseline: what is built vs what is surfaced

The authoring backend is complete and ledgered: every editor save flows through
the direct-write route (`POST /authoring/v1/direct-writes`) as a
propose→validate→submit→self-approve→apply changeset with provenance, and the
`ReviewStation` (right rail) drives approve/reject/submit/apply/rollback with
diffs. The UI surfaces body editing, frontmatter (feature tag, related links,
date, rename), and agentic changeset review — but not plan mutation, not
comments/notes of any kind, no in-editor diff, and no visible create affordance.

### 1. Block-level comment affordance (reader)

`MarkdownReader.tsx` renders through react-markdown with `remarkGfm` +
`remarkWikiLink` only; block elements map to plain HTML via the `COMPONENTS` /
`HEADING_COMPONENTS` override maps with no position/source data attached and no
per-block wrapper. The only hover/tap affordance today is document-level
(`RowMenuDisclosure` in the `DocChrome` trailing slot). Anchor identity options:
heading-path slug (stable while heading text is unchanged, inspectable without
the source), source line range from remark `position` data (precise but goes
stale on any upstream edit — display-only quality), or a hybrid. Touch
constraint: hover is invisible on touch; the established pattern is an explicit
tap target switched by `useViewportClass()` (always-visible on compact,
hover-revealed on pointer).

Recommended baseline: heading-only anchors. One `remarkBlockId` plugin slugifies
headings into `data-block-id`; a `BlockHeading` wrapper renders a right-side
comment button (Lucide, structural chrome) hover-revealed on pointer and
always-visible on compact, dispatching through one new action descriptor on the
unified action plane (never a private keydown). Paragraph-granularity coverage
and a Notion-style margin-note gutter (the reader's container-query padding
leaves right-margin room at wide widths) are deliberate escalation steps, not
the baseline.

### 2. Reading-mode toggleable actions

Read mode today: the View/Edit segmented toggle (`Mod+E`), the vault-doc menu via
`RowMenuDisclosure` + right-click (with an explicit coarse-pointer tap target),
and that is all. Registered editor chords: `Mod+E` toggle, `Mod+S` save,
`Mod+Alt+W` close — none of them surfaced visually in the chrome. Missing: a
copy-link/copy-anchor verb (the existing copy verb copies the stem, not a
navigable link), per-block actions, a comment affordance. Standing constraint
(prior review CRITICAL): formatting accelerators (Mod+B/I/K) are deliberately
NOT keymap commands — they collide with the palette and rail toggles; formatting
stays toolbar-only. Recommended: surface the existing chords as kbd hints on the
toggle segments (pure polish, zero architecture), then author one
`vault-doc:copy-link` action descriptor that enrolls across menu/palette planes.

### 3. In-editor diff

`DiffLinesView` (in `app/authoring/DiffPanel.tsx`) is exported and pure — it
takes base + proposed text shapes and diffs client-side — but is mounted only
inside `ReviewStation` keyed on a changeset id. The editor slice holds
`draftText` + `baseBlobHash` but discards the opening text, so a draft-vs-saved
diff has nothing to diff against. Recommended: store `baseText` in the editor
slice at `openEditor`, add one `editor:toggle-diff` action + toolbar button, and
mount `DiffLinesView` as a collapsible section above the textarea. Zero new wire
calls. After the ledgered pre-save changeset exists on this path, the same
surface can key on the pending changeset instead without UI change.

### 4. Dock + rail create/new actions

`left-rail:new-document` (Mod+Alt+N) is reachable from vault-tree context menus
(section, feature folder, doc row), the palette, and the chord — but no visible
button exists anywhere: not the browser-region header (only mode toggle + sort
options), not `DockHeaderActions`, not `DocChrome`, and the `WorkspaceGhost`
empty state offers only "Show graph". Every visible affordance must dispatch the
existing `newDocumentAction()` descriptor, never a bespoke handler. Recommended,
in priority order: a "New document" secondary button in the `WorkspaceGhost`
empty state (highest-conversion moment, trivial); a Plus icon button beside the
vault-tree options button in the browser-region header (always-visible
discovery); optionally per-section Plus buttons in `TreeBrowser` section headers
(the Linear model — Features-section Plus pre-fills nothing and focuses the
feature field; more wiring).

### 5. Feature lifecycle and creation UX

A feature exists only as a tag carried by at least one document — there is no
stored feature entity, and no provisional/zero-document feature state anywhere
in the served model today (the vault tree's Features level lists only tags with
documents). Feature creation is always an implicit side effect: free-text in the
create dialog's bare feature input, or the `PropertiesPopover` feature
combobox (`AutocompleteCombobox` with free text and a "type to create" empty
label) on an existing document. Gaps: the create dialog's feature input does not
autocomplete against the live `featureTags` vocabulary, and nothing in the rail
says "new feature here". Recommended: swap the create dialog's feature input to
the same corpus-fed `AutocompleteCombobox` (unifies both entry points; free text
keeps new-feature creation working), and add the Features-section Plus button.
A standalone create-feature wizard is deferred until the data model carries
feature-level metadata worth collecting at creation time. The provisional-feature
question (a declared feature with no materialized document) is a data-model
decision for the ADR: if wanted, its only legitimate durable home is the
authoring module's non-derivable state store, since engine-data must stay fully
re-derivable from the corpus.

### 6. Plan-step tick seam (backend)

The `/ops/*` core passthrough whitelists exactly two READ verbs (`vault-check`,
`vault-stats`) and 403s everything else by design; adding a plan-step verb would
be trivial mechanically but reintroduces an un-ledgered per-document write —
precisely what the ledgered-edit migration deleted. A plan tick IS a
single-document edit by that ADR's own boundary test (one plan document, one
target — the same test Link and Rename passed), so the correct seam is the
ledgered authoring path: one new core capability (plan step check/uncheck) in
the internal core adapter, one new changeset operation kind, a materializer that
invokes the canonical `vault plan step check/uncheck` CLI verb (never hand-edited
markdown — the CLI owns canonical-identifier preservation), and a
core-authoritative post-verify that re-reads the resulting checkbox state
(mirroring how Rename/EditFrontmatter verify, never an exact-blob-hash check).

Two honest frictions to record in the ADR: the plan CLI verb accepts no
expected-blob-hash fence (unlike every other ledgered write), so optimistic
concurrency can be enforced only engine-side before invoking core — a weaker
guarantee that must be stated; and subprocess timeout/output-cap breaches stay
outcome-indeterminate, which the post-verify naturally re-resolves. Because a
checkbox tick carries no reviewable prose diff, it can ride the existing
direct-only self-approved changeset kind — full history and rollback, no review
ceremony. The mutation keys on state already served: the plan-interior
projection serves per-step `S##` id + `done` (derived from re-ingest of the
document, so the tick must edit the markdown and let the watcher re-ingest —
`done` can never be written into engine-data), and plan stem + `S##` map
one-to-one onto the CLI's path + step-id arguments.

### 7. Provisional features (backend verdict)

Confirmed engine-side: a feature has no independent existence anywhere — the
constellation and filter index derive feature groups from document tags, and
core neither requires nor supports declaring an empty feature. Durable
provisional state would need a new entity in the authoring-state store PLUS a
served projection that unions provisional tags over the derived set — net-new
wire surface. Recommendation: do not build provisional persistence in V1; treat
"new feature" as client-side intent in the create dialog, materialized the
instant the first document scaffolds through the ledgered create capability. A
session-local provisional chip (visible until created or discarded) satisfies
the UX without inventing server state; revisit only if an empty feature must
survive reload.

### 8. Comments/annotations storage (backend design)

Recommended: a new comment entity in the authoring module's non-derivable
SQLite store, anchored by the existing section selector (heading-path anchor +
advisory range hint + expected content-hash), resolved exact-or-conflict. The
store already carries ledger, idempotency, outbox, retention, migrations, and
actor provenance — a comments table (doc ref, anchor, body, author actor ref,
timestamps) adds zero new infrastructure. The selector's content-hash mismatch
is the natural stale/orphaned-comment signal when anchored content is edited
(typed evidence, honest degradation, never a wrong re-anchor). Granularity
caveat: the selector anchors heading-sections, not arbitrary spans — heading-
section granularity is the honest V1 scope, matching the reader-side heading-
anchor recommendation; sub-paragraph/inline anchors need a finer selector later.
Comments-as-vault-documents is rejected (new core verbs, feature-index
pollution, template weight). Attribution rides the existing server-held actor
token seam; V1 is single-principal by design (one shared editor actor across
editor + review station; multi-user sign-in is a documented return trigger), so
every comment attributes to the shared principal until per-human identity lands
— the comment model should still carry the actor ref so attribution upgrades in
place.

### Executor caveats carried forward

The plan-tick executor must confirm the plan CLI verb's JSON status vocabulary
matches the adapter's success set (`created`/`updated`/`unchanged`/`failed`) or
widen the mapping; the comment plane needs one new read route (list comments for
a document) plus mutations, designed in the ADR; provisional-feature projection
work is explicitly out of scope for V1.
