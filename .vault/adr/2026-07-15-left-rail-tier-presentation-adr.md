---
tags:
  - '#adr'
  - '#left-rail-tier-presentation'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-left-rail-tier-presentation-research]]"
  - "[[2026-07-14-frontend-localization-adr]]"
  - "[[2026-07-03-left-rail-tree-controls-adr]]"
---

# `left-rail-tier-presentation` adr: `Keep plan tiers out of general left-rail copy` | (**status:** `proposed`)

## Problem Statement

The accepted tree-controls decision requires plan rows to render the served `L1` through
`L4` tier as “Tier N” in the document tooltip. The tier is an architecture and
implementation-difficulty classification, not a self-explanatory project status or an
action the general document tree helps a user perform. Renaming `L2` to “Tier 2” hides
the wire token but does not explain the concept.

The accepted frontend-localization decision now prohibits implementation difficulty,
raw tokens, and unexplained internal terminology from visible, accessible, and tooltip
copy. This ADR resolves that conflict narrowly. Plan tier remains governed data, but the
general left rail stops presenting it. User-facing plan progress and completion status
remain unchanged.

## Considerations

- The tier is already served and retained by the frontend data model. Removing it from
  TreeBrowser requires no wire, stable-key, or migration change.
- Plan progress is distinct user-facing information. Completed-step counts and the states
  not started, in progress, and complete explain current work without framework knowledge.
- The TreeBrowser has no tier definition, comparison guidance, or tier-specific action.
- Localization requires complete messages, locale-aware formatting, concise product
  language, and no raw tokens or implementation difficulty.
- Keeping the field preserves compatibility and allows a separately governed expert
  surface to use it if that surface defines the concept and establishes a user need.
- This decision changes presentation authority only. It does not reinterpret, rename,
  calculate, filter, or sort by plan tier.

## Considered options

- **Render `L1` through `L4`.** Rejected because it exposes an unexplained internal token.
- **Translate to “Tier 1” through “Tier 4”.** Rejected because localization changes the
  spelling but not the unexplained implementation-difficulty concept.
- **Add tier help to each plan tooltip.** Rejected because it increases navigation density
  for metadata with no immediate user action.
- **Remove tier from the wire and data model.** Rejected because the data remains valid for
  architecture and other separately governed consumers.
- **Keep tier as data but omit it from TreeBrowser.** Chosen because it preserves the
  contract while satisfying the general UI language boundary.

## Constraints

- The served plan-tier field remains unchanged in the engine response, tolerant adapter,
  and frontend data model.
- TreeBrowser never renders plan tier in visible text, accessible names, descriptions,
  live regions, native titles, custom tooltips, or other user-observable attributes.
- Known, malformed, and future tier values follow the same omission rule. No fallback may
  capitalize, humanize, interpolate, or otherwise expose them.
- Plan progress, completion marks, counts, and localized status labels remain user-facing.
- Other tree-controls D1 signals remain binding, including dates, decision status, plan
  progress, document size, and metadata density.
- A future surface may present plan tier only through a reviewed decision that defines the
  user concept and demonstrates a user-facing purpose.
- The parent wire, adapter, TreeBrowser, and localization systems are stable and require no
  architectural restructuring.

## Implementation

**D1 - Preserve tier as governed data.** The engine continues serving the optional tier,
and the stores boundary retains it without translation or reinterpretation. No wire field,
adapter contract, or stable identity changes.

**D2 - Remove tier from general TreeBrowser presentation.** The plan-tier label helper and
tooltip line derived from it leave the left-rail presentation path. No tier message key is
created because omission, not translation, is the product behavior.

**D3 - Preserve user-facing plan state.** Plan rows continue rendering served progress
through localized status labels, localized counts, and the existing shape-distinct mark.
Compact and desktop presentations retain equivalent status meaning.

**D4 - Fail closed.** Any tier value remains absent from visible and accessible TreeBrowser
output. Missing or unexpected tier data produces no fallback copy.

**D5 - Enforce the boundary.** Presentation tests prove that tier values and “Tier N” do
not appear in rendered text, accessible names, descriptions, or tooltips while plan
progress remains localized. Source policy prevents raw tier interpolation from returning.

**D6 - Amend one prior presentation requirement.** This decision partially supersedes
only the tree-controls D1 requirement that a plan leaf render its tier in the row tooltip.
All other review signals and decisions stand. Frontend localization remains fully binding.

## Rationale

The earlier tree-controls research correctly established that plan tier is backend-served
and can be rendered without client invention. Backend authority answers whether a value is
truthful, but it does not establish that the value belongs in every user-facing surface.

The localization research identifies implementation difficulty and unexplained internal
vocabulary as prohibited general UI copy. TreeBrowser cannot make plan tier actionable by
changing `L2` to “Tier 2”. Omitting the value is more honest than translating it. Retaining
the field preserves architecture compatibility without weakening the language boundary.

The amendment is intentionally narrow. Plan progress communicates current work in familiar
terms and remains valuable. Only the unexplained tier classification leaves the general
left rail.

## Consequences

- General TreeBrowser copy no longer exposes `L1` through `L4`, “Tier N”, or equivalent
  implementation-difficulty language.
- Plan rows retain useful progress and completion signals in compact and full layouts.
- The engine and stores continue carrying a field TreeBrowser does not consume. This is
  deliberate contract preservation, not a second presentation authority.
- Users lose one compact architecture classification from the tooltip and gain a clearer
  navigation surface containing only concepts it can explain and support.
- A future expert surface can use tier without a wire migration, but it must define the
  concept and earn its presentation through a separate reviewed decision.
- The tree-controls ADR is superseded only for its D1 tier-presentation clause. Its date,
  status, progress, size, sorting, reset, and indentation decisions remain unchanged.
