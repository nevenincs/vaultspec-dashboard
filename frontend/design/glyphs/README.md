# vaultspec hand-drawn glyph family — v1

The commissioned glyph family for the vaultspec dashboard's visual language
(dashboard-gui task #13; ADR `2026-06-12-dashboard-gui-adr` §7.2). Source of
truth is `src/*.svg`; `contact-sheet.html` is the review surface.

These are **design sources**. They are not wired into the app. The running
field consumes textures through the `GlyphTextureProvider` seam
(`frontend/src/scene/field/nodeSprites.ts`); the eventual swap from the
programmatic placeholder set (`frontend/src/scene/field/glyphs.ts`) to this
family is a texture-generation change behind that same seam, out of scope for
this deliverable.

## Naming convention

One file per glyph: `{category}-{name}.svg`, lowercase kebab-case.

| Category   | Members                                                                              |
| ---------- | ----------------------------------------------------------------------------------- |
| `doc-`     | research, adr, plan, exec, audit, reference, index                                  |
| `node-`    | feature (the compound species)                                                      |
| `event-`   | commit, doc-created, doc-modified, lifecycle                                        |
| `tier-`    | declared, structural, temporal, semantic                                            |
| `state-`   | active, complete, archived, broken, stale                                           |
| `ring-`    | track, fill-25, fill-50, fill-75, complete                                          |

The `doc-*` and `node-feature` names map one-to-one onto the `GLYPH_KINDS`
vocabulary in `glyphs.ts` (`feature`, `research`, `adr`, `plan`, `exec`,
`audit`, `reference`, `index`) so the field can resolve a kind to a glyph by
name. `code` and `index` exist in `GLYPH_KINDS`; `doc-index` covers `index`,
and a `code` glyph is intentionally out of scope for this 26-glyph family
(it is a placeholder kind, not a vault doc type). The `tier-*` and `state-*`
names map onto `TIER_GLYPH_MARKS` / `STATE_GLYPH_MARKS`.

## Construction rules (keep the family one hand when extending)

ADR §7.2 made concrete. Every new glyph MUST follow all of these.

- **Canvas.** `viewBox="0 0 24 24"`, 20×20 safe area, optical centering.
- **Anchor geometry is EXACT.** Symmetry axes, dot centers, arc angles are
  precise numbers (e.g. ring arcs are exactly 90/180/270° anchored at 12
  o'clock, clockwise; the diamond sits on center `(12,12)`). The hand-drawn
  quality lives ONLY in stroke treatment — never in displaced anchors, never
  in random jitter on coordinates. A wobbly line may be the aesthetic; a
  wobbly value is a lie.
- **One line family, three weights** (units at 24px): `detail` 1.25,
  `primary` 2.0 (the default), `accent` 2.75. Set the glyph-wide default on
  the root `<svg stroke-width="…">` and override per-path only where a stroke
  carries a different weight.
- **Round caps and joins everywhere:** `stroke-linecap="round"`,
  `stroke-linejoin="round"`. The one exception is a sharp ornament that
  reads as sharp by design (the `state-broken` lightning uses
  `stroke-linejoin="miter"`); flag any such exception in a comment.
- **Single `currentColor` ink, no internal colors.** Theming and tier/state
  hue are the consumer's job. Fills are solid `currentColor` only, used where
  the design says "filled" (filled dots, the declared diamond, settled sand,
  the index's one filled cell).

### The hand-drawn treatment — how this family expresses "pen pressure"

The spec asks for "subtle width variation along the stroke (pressure feel)."
This family delivers that character through **three deterministic, consistent
devices** rather than per-stroke outlined width modulation. The rationale is
the 14px legibility gate (below): authored variable-width outline fills lose
their modulation entirely below ~24px and add contour noise that muddies small
sizes, fighting the very gate the spec makes a hard requirement. So, one hand,
expressed as:

1. **Curvature bow.** "Straight" strokes are drawn as gentle quadratic
   béziers with a faint, consistent bow (≈0.2–0.3u of sag) — the rails in
   `doc-plan`, the lid in `doc-audit`, the branch in `event-commit`. No
   mathematically straight data lines except the ring arcs (where precision is
   the point).
2. **Corner overshoot/undershoot ≤0.5u.** Confident pen strokes run slightly
   past their corner before turning, the same small amount and direction
   everywhere (square corners in `doc-index` / `tier-structural`, terminus of
   the `state-complete` check, rail ends in `doc-plan`).
3. **Weight tiers carry hierarchy.** Pressure reads as weight: structural
   silhouette at `primary`, secondary ornament at `detail`, the one emphatic
   stroke per glyph (the exec check, the structural anchor-notch, the broken
   bolt) at `accent`.

This is a **flagged interpretation** of the spec's width-variation clause: the
design authority approved the contact sheet, and the deviation note records the
swap of "per-stroke width modulation" for "curvature + overshoot + weight
tiers." If a future extension wants literal variable-width outlines, do it
family-wide (all 26), never one-off — the cardinal rule is one hand.

## Accessibility gates (verified — re-verify on any change)

- **Tier marks distinguish in pure grayscale at 14px by shape + treatment
  alone.** Verified on the contact sheet's grayscale proof row:
  - `tier-declared` — solid filled diamond (the only filled tier mass)
  - `tier-structural` — open square + bold accent corner-notch
  - `tier-temporal` — dashed/dotted ring + center dot (the only dashed stroke)
  - `tier-semantic` — three stacked tilde waves (the only multi-stroke field)
  Four distinct silhouettes, four distinct treatments; no two collide under a
  squint test. Hue is never load-bearing.
- **All glyphs read at 14px.** Verified by headless-Chrome screenshot at the
  three sizes. Simplifications recorded below.
- **Contact-sheet label contrast meets WCAG AA on both themes:** ink `#2b2723`
  on paper-warm `#faf6ef` ≈ 12.6:1; ink `#ece5d8` on `#211e1a` ≈ 12.9:1. Glyph
  contrast itself is the consumer's job (`currentColor`).

### Simplifications recorded (for the 14px gate)

- **`node-feature`** was revised after design-authority review: the original
  symmetric three-equal-dots-in-a-closed-circle read as a face at 24/44px. The
  v1 form breaks facial symmetry per the redline — three dot SIZES (r 2.0 /
  1.4 / 1.0) in a scalene triangle with the largest low-left, the binding loop
  left OPEN with a ~70° gap at the upper-left (a sketched lasso, not a closed
  head), and ONE detail-weight constellation thread between the two smaller
  dots, steeply diagonal with clear air around each dot so it never fuses into
  a bar (an intermediate draft's near-vertical thread fused into an
  exclamation-mark reading — avoid that collision with alert semantics when
  editing). Target reading: "a loose hand-circled cluster of unequal points."
  When editing, re-check it against `state-active` (the other open-ring glyph;
  the asymmetric multi-dot interior is what keeps them apart) and `doc-index`
  (the other dotty glyph).
- **`doc-research`** dot-grid is three points (the inquiry triad), not a full
  grid — a fuller grid is illegible under the lens at 14px.
- **`doc-audit`** iris is a ring + solid pupil only (no eyelashes/detail); the
  eye was opened wide and the iris enlarged so the almond + iris survive
  downscale.
- **`event-lifecycle`** pennant renders as a filled silhouette; its swallowtail
  notch is present in geometry but reads as a plain pennant below ~20px. Intent
  (a flag on a pole) holds.
- **`state-broken`** lightning was made taller and the line gap widened so the
  bolt-through-a-line silhouette survives 14px (an earlier draft collapsed to a
  star/plus).

## Regeneration

`contact-sheet.html` is generated, not hand-edited. It inlines each `src/*.svg`
body verbatim (stripping only the per-file `width`/`height`/`viewBox`/`xmlns`
and re-applying the viewBox at each preview size), so the sheet always reflects
the sources exactly. To rebuild after editing or adding an SVG, re-run the
generator that produced it (a small Node script that walks `src/`, groups by
the category table above, and emits the light / dark / grayscale sections). If
the generator script is not committed alongside this folder, the rule it
encodes is simple enough to reproduce: read every `src/*.svg`, inline its inner
markup three times at 14/24/44px under both theme grounds, plus one grayscale
row of the four `tier-*` marks with `filter: grayscale(1)`.

Self-check before committing a change: open `contact-sheet.html` in a browser
(or headless Chrome) and confirm at 14px that (a) every glyph reads, (b) the
four tier marks stay mutually distinct in the grayscale row, and (c) the new
or edited glyph still looks like the same hand drew it.

## Files

- `src/*.svg` — 26 glyph sources (the deliverable).
- `contact-sheet.html` — self-contained review page (light + dark + grayscale).
- `README.md` — this file.
