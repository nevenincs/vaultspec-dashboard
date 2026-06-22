---
tags:
  - '#audit'
  - '#mobile-responsive-layout'
date: '2026-06-22'
modified: '2026-06-22'
related:
  - '[[2026-06-22-mobile-responsive-layout-adr]]'
  - '[[2026-06-22-mobile-responsive-layout-research]]'
---

# `mobile-responsive-layout` audit: `compact frames design review`

## Scope

Design-phase review of the seven compact (mobile, 390×844) frames authored in the
binding Figma file `SlhonORmySdoSMTQgDWw3w`, section "Compact · Mobile
(responsive)", per the design-first gate of the accepted ADR
`[[2026-06-22-mobile-responsive-layout-adr]]`. Frames: Browse (landing) · Document
reader (slide-in) · Filter sheet · Search (full-screen) · Timeline minimode ·
Status · Graph (not available). Each was built composing the centralized kit
(Tab/IconButton, Segment, Chip, StatusDot, SectionLabel, SearchField,
SearchResultPill, PRPill, GitStatusPill, ProgressBar, Button) with all fills/strokes
bound to the colour variables and all type from the text-style ramp. Two review
passes were run: (1) seven independent **no-context UX reviewer** sub-agents, one per
frame, judging purely from the screenshot with no knowledge of intent (the
DESIGN-SYSTEM §9 gate); (2) a **style-system standardization** pass for kit/token
conformance and cross-frame cohesion. This audit consolidates both and records what
was fixed in-pass versus deferred.

## Findings

### Cross-cutting (recurred across ≥3 frames)

- **HIGH C1 — Bottom tab bar had no safe-area inset.** The tab bar sat hard on the
  frame's bottom edge, colliding with the iOS home-indicator gesture zone. FIXED in
  pass: tab-bar bottom padding raised and bar height grown to reserve the inset on
  all four tab-destination frames (Browse, Graph, Timeline, Status).
- **HIGH C2 — Active-tab indicator too weak.** Active state relied on hue plus a
  faint icon pill — fails colour-blind users and is easy to miss. FIXED: the active
  tab item now carries an `accent-subtle` filled pill behind icon+label (redundant
  with the accent-text colour), a stronger non-colour-only cue.
- **HIGH C3 — Touch targets below 44pt.** Chips, segmented tabs, top-bar icon
  buttons, the scrubber thumb, and commit/list rows render ~24–32pt. DEFERRED to a
  kit decision (D-S2 below): the affected primitives are kit components whose
  intrinsic height is shared with desktop; the fix is a mobile size token/variant,
  not a per-instance override.
- **MED C4 — Small, low-contrast meta & section labels.** `SectionLabel` (Caption,
  `ink/faint`) and `Meta/11` reads borderline at phone scale across Browse, Filter,
  Search, Status, Reader. DEFERRED to a kit/foundation decision (D-S3): bumping is a
  design-system contrast change, not a per-frame edit.
- **MED C5 — Large dead space below content.** Every frame ends ~40–60% down. For
  scrolling surfaces (Browse, Reader, Search, Status) this is an artifact of
  representative short content and is expected. For genuinely sparse surfaces
  (Timeline, Graph) it reads as unbalanced — addressed per-frame below.

### Per-frame

- **Browse.** HIGH: right-aligned counts + the "8"/"6" on section-label rows read as
  stray, ambiguous numbers; rows gave no tappability cue. FIXED: trailing chevrons
  added to every feature/folder row. DEFERRED: relabel/clarify the section-header
  counts; colour-dot legend (dots carry tier/kind meaning with no key).
- **Document reader.** HIGH: back chevron and top-right overflow are unlabeled and
  ~24pt (C3). MED: the H1 duplicates the app-bar title verbatim above the fold;
  "accepted" status buried in the meta line should be a chip. DEFERRED to next pass.
- **Filter sheet.** HIGH: selected vs unselected chips nearly indistinguishable (the
  Chip `Active` variant's pale-green fill is too close to the unselected tan) — the
  single most-cited correctness issue. DEFERRED to kit (the Chip Active variant needs
  a stronger selected treatment — a filled accent or a check glyph). MED: sheet is
  over-tall (dead zone under the CTA) — size sheet to content + bottom safe-area.
- **Search.** HIGH: selection metaphor ambiguous (one result has the accent ring, an
  adjacent near-identical row does not); green is overloaded (selection + active tab
  + "Change" type). MED: result rows need a dominant title and a consistent 2-line
  snippet clamp. DEFERRED.
- **Timeline minimode.** HIGH: the accent track fill reads as a *progress bar*
  (done/remaining), not a draggable *scrubber*; thumb hit area < 44pt. MED: the
  "Now" affordance is an ambiguous green label. DEFERRED: give the thumb
  elevation/grip and de-emphasize the fill; the "N documents on this day" card is the
  sanctioned bridge that keeps the surface scrubber-only per ADR D2t (no lane viz),
  and may expand into the day's document list to use the lower space.
- **Status.** HIGH: four different section-container metaphors (filled pill for
  location, borderless row for Changes, bordered cards for Plans/PRs, bare text for
  commits) break scannability; commit rows are bare text < 44pt with no affordance.
  DEFERRED: converge on one row/card system; give commit rows the PR-row treatment.
- **Graph (not available).** HIGH: the fallback CTA was a secondary button on a
  dead-end screen. FIXED: promoted to the primary (accent-filled) button. MED: the
  content block floats slightly above optical centre; the node glyph is small for the
  empty canvas. DEFERRED: enlarge the glyph and centre the block.

### Style-system standardization

- **PASS — colour.** Every element fill/stroke is bound to a colour variable (zero
  raw hex) except the section *band* background (scaffolding, not a UI element).
- **PASS — type.** All text uses the shared text-style ramp (chrome Inter ramp;
  editorial Fraunces Reader ramp).
- **PASS — components.** Surfaces compose kit instances; no hand-built primitives
  were introduced on the surfaces.
- **GAP S1 — three glyphs were missing from the Icon set.** Search (MagnifyingGlass),
  filter (Funnel), and back (ChevronLeft) did not exist. CLOSED in pass: authored as
  Phosphor-grade stroked glyphs bound to `ink/faint` and appended to the `Icon`
  component set as new `Glyph=` variants.
- **GAP S2 — mobile primitives not yet componentized.** The bottom tab bar, the
  mobile top bar, and the bottom-sheet shell are composed ad-hoc from atoms
  (IconButton + caption, etc.). Per `design-system-is-centralized` these should be
  promoted to kit components (`BottomTabBar`, `MobileTopBar`, `BottomSheet`) with the
  44pt touch-target and safe-area baked in, then instanced.
- **GAP S3 — container paddings are raw numbers.** Frame/section paddings (12/16/20…)
  are literal, not bound to the `space/*` float variables the kit uses — the same
  spirit-vs-letter gap the ADR's D1b names for layout dimensions; bind them when the
  primitives are componentized.

## Recommendations

1. Promote the three new glyphs (done) and build the mobile kit primitives
   (`BottomTabBar`, `MobileTopBar`, `BottomSheet`) with ≥44pt targets + safe-area
   (closes C3, S2) before the next design iteration.
2. Add a mobile touch-size variant to Chip and Segment, and strengthen the Chip
   `Active` treatment (closes C3 partially + the Filter HIGH).
3. Take a foundation decision on small-label contrast at phone scale (C4) — either a
   compact contrast step or a minimum on-mobile size.
4. Per-frame second pass: Status container convergence, Search selection metaphor,
   Reader header de-duplication + status chip, Timeline scrubber affordance.
5. Re-run the seven no-context reviewers after the second pass; gate "done" on a
   clean pass per DESIGN-SYSTEM §9. Then route to the user for the design approval
   the ADR's design-first gate requires before any code.

## Codification candidates

- **Source:** finding C1 + S2 (safe-area + componentized mobile chrome).
  **Rule slug:** `mobile-chrome-reserves-safe-area-and-44pt-targets`.
  **Rule:** Compact-layout chrome (tab bar, top bar, sheets) is authored from
  dedicated kit primitives that reserve the platform safe-area inset and guarantee
  ≥44pt touch targets; surfaces never hand-place mobile chrome with desktop-intrinsic
  hit areas.
  *(Candidate only — promote per the codify discipline after it holds across the
  build cycle, alongside the ADR's two standing candidates.)*
