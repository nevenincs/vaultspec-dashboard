# Editable Figma recreation runbook (plan W03)

Turns a rendered Storybook story into an **editable, variable-bound** Figma node tree
(not a screenshot). Proven on `LensSelector` (node 4:72). This is the per-component loop
for recreating all 50 components; it is staged (50 components + 34 missing stories).

File: `8WDmXNOURdRQwdefWNGsBb` (https://www.figma.com/design/8WDmXNOURdRQwdefWNGsBb).

## Prereqs

- Storybook running: `npm run storybook` (the `.storybook/main.ts` viteFinal strips the
  engine-dev plugin + disables the HMR overlay so renders capture clean).
- The component has a story. If not, write one first (W03.P12) — see `src/app/**/*.stories.tsx`.
- Figma variables already seeded (W01.P04): Primitives + Semantic collections.

## Per-component loop

1. **Render**: Playwright `browser_navigate` to
   `http://localhost:6006/iframe.html?id=<storyId>&viewMode=story`, then `browser_wait_for`
   ~3s for the mockEngine data to settle.
2. **Extract**: `browser_evaluate` with the `EXTRACTOR` from `figma/dom-extract.js` →
   `{ rootW, rootH, nodes:[{d,t,x,y,w,h,bg,bc,bw,r,col,fz,fw,txt,svg}] }` (absolute
   positions relative to the story root).
3. **Build**: `use_figma` on the component's registry node id (from `component-map.json`):
   clear children, apply the root box's fill/stroke/radius to the host, then for each child
   node create a `frame` (boxes) or `text` (the `txt` runs) at its x/y/w/h. Bind every
   fill/stroke/text color to the matching variable via `setBoundVariableForPaint` using a
   hex→variable map (the Light-mode token hex; see `tokens/figma/tokens.json`). SVG icons
   are placeholders for now — replace with `figma.createNodeFromSvg()` using the mark path
   bodies from `src/scene/field/marks.ts` (icon pass).
4. **Verify**: `get_screenshot` the node; compare to the Storybook render.
5. **Record**: node id already bound in `component-map.json`; re-run `npm run figma:registry`.

## Color binding map (Light-mode hex → variable)

Derive from `tokens/figma/tokens.json` `semantic-light`. Common: `#312d27`→`public/scene/ink`,
`#5f5a53`→`public/scene/ink-muted`, `#ebe6e0`→`public/scene/rule`, `#fdfaf6`→`public/chrome/paper`,
`#457650`→`public/chrome/accent`. A node color with no exact token match is set as a raw fill
(flag for token review).

## Status

- Pipeline proven: `LensSelector` recreated editable + variable-bound (4:72).
- Interim: `LeftRail` (4:69) and `ChangesOverview` (4:18) currently carry real-render IMAGE
  fills (fast proof the real UI exists in Figma); to be re-done editable per this runbook.
- Remaining: editable recreation of the other 47 components + write 34 missing stories.
- SVG icon fidelity (createNodeFromSvg from marks.ts) is a dedicated pass.
