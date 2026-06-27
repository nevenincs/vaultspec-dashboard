# Figma Icon set — real Lucide + Phosphor, no hand-drawn glyphs

The binding Figma Icon component set (`159:136`, variant property `Glyph`) is
authored from the **same two icon libraries the frontend imports** — never
hand-drawn approximations (`icons-come-from-the-two-sanctioned-families`):

- **Structural chrome → Lucide** (`lucide-react`), stroke-based.
- **Expressive / domain marks → Phosphor** (`@phosphor-icons/react`,
  `regular` weight), fill-based.

The frontend renders the real library components, so the Figma glyphs must be the
exact same marks for visual parity. Earlier glyphs were hand-drawn (e.g. the
calendar was four raw rectangles), which drifted from the shipped icons and
looked inconsistent (different optical sizes, off-centre). All 42 glyphs were
re-authored from the real package SVGs on 2026-06-27.

## How to (re)author a glyph from the real SVG

1. **Extract the path data from `node_modules`** (the source of truth):
   - Lucide: `node_modules/lucide-react/dist/esm/icons/<kebab-name>.mjs` — the
     `__iconNode` array, `viewBox 0 0 24 24`, `stroke=currentColor`,
     `stroke-width 2`, round caps/joins.
   - Phosphor: `node_modules/@phosphor-icons/react/dist/defs/<PascalName>.es.js`
     — the `"regular"` weight's `<path d>`(s), `viewBox 0 0 256 256`, fill-based.
2. Build an SVG string and `figma.createNodeFromSvg(svg)`.
3. `imported.rescale(16 / 24)` for Lucide, `imported.rescale(16 / 256)` for
   Phosphor (the glyph variant frame is 16×16).
4. Bind the mark's colour to the ink token, NOT a literal:
   - Lucide (stroke): bind every stroke to `VariableID:51:14`.
   - Phosphor (fill): bind every vector fill to `VariableID:51:16`.
5. Replace the variant's children with the imported node and centre it
   (`x = (16 - w) / 2`, `y = (16 - h) / 2`).

## Glyph → library mapping

**Lucide (chrome):** FolderPlus, Plus, Minus, File, Folder, ChevronRight,
ChevronDown, ChevronLeft, Maximize, Crosshair, PanelLeft, PanelRight, Calendar,
GitBranch, Funnel, MagnifyingGlass (Lucide `search`), Menu, Eye, Database,
CheckCircle (Lucide `circle-check`), AlertTriangle (Lucide `triangle-alert`),
CircleSlash, Books (Lucide `library` — the vault/browse mark is chrome, so it is
Lucide, not Phosphor Books), PR (`git-pull-request`), Merge (`git-merge`), Issue
(`circle-dot`), Commit (`git-commit-horizontal`).

**Phosphor (domain):** Hierarchy (Phosphor `Graph`), TreeStructure, Gear,
Diamond, ClipboardText, Stack, SealCheck, BookOpen, Pencil, FileDashed,
ListBullets, Plan (`ListChecks`), StepDone (`CheckCircle`), StepInProgress
(`CircleHalf`), StepOpen (`Circle`).

## Related

- The bottom tab bar (`823:3859`) is icon-only with a compact centred active
  pill; its glyphs are instances of this set (Library / Calendar / GitBranch /
  MagnifyingGlass).
- Tag/chip family (Chip / Badge / TimeTravelChip / CategoryChip) is converged on
  the pill radius token `467:1730`; the frontend already uses `rounded-fg-pill`.
- Type ramp bumped for legibility (shared by mobile + desktop): title 16, body
  14, label 13, meta 12, caption 11, mono 12 — see `tokens/type.tokens.json`.
