---
tags:
  - '#adr'
  - '#code-timeline-range'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-codebase-graphing-adr]]"
  - "[[2026-06-15-dashboard-timeline-adr]]"
  - "[[2026-07-02-graph-simulation-stability-audit]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #adr) and one feature tag.
     Replace code-timeline-range with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     Status convention: the H1 status value is one of proposed, accepted,
     rejected, superseded, or deprecated. A new ADR starts as proposed; it
     moves to accepted or rejected when the decision is made; it becomes
     superseded when a later ADR replaces it (set by vault adr supersede,
     which also records superseded_by); and deprecated when it is retired
     without a direct successor.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `code-timeline-range` adr: `code corpus timeline range` | (**status:** `accepted`)

## Problem Statement

The timeline is inert and dishonest in code view mode. The range strip renders the
VAULT corpus's date span, its `date_range` write cannot narrow the code slice on
either side (the engine rejects vault filter facets on `corpus=code`, the client
mask ignores dates by design), and time travel is corpus-blind — a scrub in code
mode fetches a VAULT historical slice and pushes it onto the code canvas. Root
cause: code nodes are minted with no dates at all, the code corpus's request
grammar (`CodeNarrow`) has no date facet, and the timeline chrome never learned the
corpus concept. The user directive is explicit: the timeline range must filter code
nodes. This amends the codebase-graphing ADR's D5 facet fencing (which anticipated
additive per-corpus facets) without unfreezing the vault filter shape.

## Considerations

- The ingest walk already stats every source file — `mtime_ms` rides `WalkedFile`
  for the `(path, len, mtime)` fingerprint — so an mtime-backed date costs zero
  extra IO; it just needs plumbing into the minted node.
- `Dates` has exactly one slot a code file can honestly fill: `modified`
  (worktree mtime, ms). `created` (frontmatter date) and `stamped` (CLI stamp) are
  vault-document concepts with no code analogue; git birth/commit time would need
  a per-file git walk the ingest deliberately avoids.
- Vault date matching is inclusive lexical `yyyy-mm-dd` on the criterion field,
  with missing-date EXCLUDED once a range is set. Reusing those exact semantics
  keeps one matching discipline across corpora.
- One corpus-filter authority: `date_range` is written only by the timeline Setter
  into `dashboardState.filters`; the code corpus must consume that SAME record —
  never a parallel code-only range store.
- D5's fencing mechanism (typed validation errors for corpus-mismatched facets) is
  the extension point: a facet can be declared as BELONGING to the code corpus.
- The strip's criterion (created/modified/stamped) is an engine-served setting; in
  code mode only `modified` exists, so the honest presentation pins the criterion
  and says why, rather than silently matching a different field than the label.
- Time travel (as-of/diff) is a git-history axis the code corpus does not have
  (present view only, D5); the range strip and time travel are distinct planes and
  must degrade independently.

## Considered options

- **A — extend the code grammar with the shared `date_range`/`date_field` facet,
  backed by ingest mtime.** The code branch accepts EXACTLY those two vault-filter
  fields (every other facet still a typed 400), matches with the vault's date-key
  semantics on `modified`, and serves code `date_bounds` from the same vocabulary
  route. CHOSEN.
- **B — a code-only body facet (`mtime_from`/`mtime_to`).** Rejected: forks the
  date-range authority into a second grammar, forces the timeline Setter to write
  two shapes, and drifts from the one-filter-record rule for zero expressiveness
  gain.
- **C — client-side date masking of code nodes.** Rejected outright: violates
  "every reducing facet applies on the engine" (node-ceiling truncation makes a
  client narrow silently wrong), and the mask layer deliberately owns no date
  logic.
- **D — git commit-time instead of mtime.** Rejected for now: needs a per-file git
  log walk (or a libgit2 dependency path) the ingest's zero-extra-IO discipline
  forbids; mtime is already statted and is the build-system-standard freshness
  signal. Recorded as the upgrade path if "checkout resets mtimes" proves
  misleading in practice.
- **E — hide the timeline entirely in code mode.** Rejected: the range strip is
  exactly the affordance the user asked to have work; only the GIT-HISTORY plane
  (time travel) is a genuine non-capability on code.

## Constraints

- Parent stability: the code corpus store (`CodeGraphCell`, generation-memoized)
  and the settle-on-swap scene hardening are mature and freshly guard-tested; the
  `SceneController` seam needs NO change (a range change is an ordinary re-keyed
  set-data).
- The vault `Filter` SHAPE stays frozen (D5): the code branch reuses two existing
  fields; no new filter fields are minted.
- mtime is worktree state: a fresh checkout or branch switch rewrites mtimes, so
  the code span reflects "when files last changed on THIS machine", not history.
  Honest labeling ("Modified") and the D option's recorded upgrade path carry that
  trade-off.
- Every touched read stays bounded: bounds computation is one pass over the
  already-held graph; no new accumulator, subprocess, or unbounded walk.

## Implementation

- **Ingest**: plumb `mtime_ms` from the walk into the minted file node as
  `dates.modified`; a module node derives no date of its own.
- **Query**: `CodeNarrow` gains an optional date range (from/to date keys).
  Matching mirrors the vault semantics — inclusive day-key bounds on `modified`,
  missing mtime excluded when a range is set. A FILE passes by its own mtime; a
  MODULE passes when at least one direct member file passes (a container is "in
  range" iff it has in-range content), in both granularities. Rollup
  `member_count` and module hues stay full-graph (color identity and counts are
  stable under narrowing, the existing discipline).
- **Route**: the code branch's filter gate is relaxed to accept a vault `Filter`
  whose ONLY populated facets are `date_range` and `date_field: modified` (absent
  defaults to modified for code); any other populated facet, and any `date_field`
  naming a criterion code cannot serve, stays a typed 400.
- **Vocabulary**: `/filters?corpus=code` additionally serves `date_bounds` +
  `date_bounds_by_field: { modified }` computed from file mtimes, so the strip has
  a real span to fit to.
- **Frontend**: the filters-vocabulary read becomes corpus-aware (corpus in the
  wire call and the TanStack key); the strip consumes the active corpus's bounds,
  pins the criterion control to Modified in code mode (disabled-with-reason for
  created/stamped), and its `date_range` write now re-keys the code graph query —
  the code request identity un-pins exactly `date_range` (+ the pinned `modified`
  criterion) while doc-type/text/lens/focus stay pinned. The graph queryFn sends
  `filter: { date_range, date_field: "modified" }` for code.
- **Time travel fencing**: the commit-menu "View corpus at this commit" action is
  not enrolled in code mode (vault-only capability, per the eligibility rule), the
  scrub driver refuses to run while the corpus is code, and a corpus switch with a
  historical timeline mode heals the mode to live — a vault as-of slice can never
  land on the code canvas.
- Guards: engine unit tests (date narrow file/module/rollup, gate acceptance and
  typed rejections, code date bounds), frontend live-wire tests (corpus-keyed
  vocabulary, code identity re-keys on range, code slice narrows), and a
  time-travel fencing test.

## Rationale

Option A is the only shape that satisfies all three governing disciplines at once:
one filter authority (the timeline Setter keeps writing the one `date_range`
record and every corpus consumes it), engine-side reduction (the narrow happens in
`code_graph_query` under the node ceiling, never as a client mask), and D5's
per-corpus facet fencing (the shared facet is declared as belonging to code; the
union request shape still cannot drift because everything else stays a typed
error). mtime is chosen not as the best possible time axis but as the only one the
ingest already possesses at zero cost, with the honest degradation that it is
worktree-local; the git-time upgrade is recorded, not improvised. Fencing time
travel off the code corpus is the complement: the range strip becomes real, and
the one genuinely impossible plane (git-history as-of) stops pretending — the
current behavior of pushing vault history onto a code canvas is a corpus-mixing
defect, not a feature to preserve.

## Consequences

- The timeline range strip becomes a working, corpus-honest filter in both view
  modes; code nodes and their modules narrow in lock-step with the rail and graph.
- Code nodes gain a served `modified` date, which future surfaces (tooltips,
  salience recency) may consume — served state, no client derivation.
- mtime semantics are worktree-local: a fresh clone shows a compressed span. The
  criterion label says Modified and only Modified; if this proves misleading, the
  recorded git-time option is the successor decision.
- The `/filters` read doubles per corpus in cache (keyed identity), bounded by the
  existing query GC.
- Time travel is now explicitly a vault capability; entering code mode mid-scrub
  returns to live. This removes a latent corpus-mixing bug rather than adding a
  restriction (the code corpus never had history to travel).
