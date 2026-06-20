# Handover Brief: Create a `figma-visual-parity` Skill

You are taking over a focused codification task. Do not continue product development. Your job is to create a reusable Codex skill that captures a Figma design node as PNG, captures a live local UI at matching dimensions, and produces split-view, direct-overlay, and diff-image artifacts for visual verification.

This brief is intentionally detailed. Treat it as the source material for the skill, not as the final skill text. The finished skill should be concise in `SKILL.md` and move long procedures, command examples, and tool notes into `references/` and deterministic scripts.

## Objective

Create a new skill named:

```text
figma-visual-parity
```
Purpose:

```text
Use when Codex must verify frontend visual parity against Figma by acquiring a Figma node PNG, capturing the live implementation at matching bounds, and generating local comparison artifacts: split view, direct alpha overlay, and pixel-difference image.
```

The skill must encode the workflow we proved in `Y:\code\vaultspec-dashboard-worktrees\main` while remaining general enough for other Figma nodes and local routes.

## Non-Negotiable Rule

Visual verification is a hard gate. It is not enough to inspect DOM, tests, screenshots in isolation, or MCP design context. A valid run must produce local image files for:

1. The Figma reference PNG.
2. The live implementation PNG.
3. A same-dimension split comparison PNG.
4. A same-dimension direct overlay PNG.
5. A same-dimension pixel-difference PNG.
6. A JSON report with dimensions and basic pixel-delta statistics.

When possible, also produce a small static HTML review page that loads the local PNGs and lets the reviewer adjust overlay opacity without a dev server.

## Proven Working Example

The workflow was validated for the VaultSpec Dashboard timeline surface.

Figma source:

```text
fileKey: SlhonORmySdoSMTQgDWw3w
nodeId: 239:713
node URL: https://www.figma.com/design/SlhonORmySdoSMTQgDWw3w?node-id=239-713
natural Figma screenshot size: 844x212
```

Live route:

```text
http://127.0.0.1:5176/timeline.html
```

Verified local output directory:

```text
output/visual-compare/
```

Generated files:

```text
timeline-figma-239-713.png
timeline-live-844x212.png
timeline-split-844x212.png
timeline-overlay-alpha-844x212.png
timeline-diff-844x212.png
timeline-visual-compare-report.json
timeline-visual-compare.html
```

Observed report:

```json
{
  "figma": {
    "path": "Y:\\code\\vaultspec-dashboard-worktrees\\main\\output\\visual-compare\\timeline-figma-239-713.png",
    "width": 844,
    "height": 212
  },
  "live": {
    "path": "Y:\\code\\vaultspec-dashboard-worktrees\\main\\output\\visual-compare\\timeline-live-844x212.png",
    "width": 844,
    "height": 212
  },
  "compare": {
    "width": 844,
    "height": 212
  },
  "pixelDelta": {
    "changedPixelsOver24": 26068,
    "totalPixels": 178928,
    "changedRatio": 0.1457,
    "meanMaxChannelDelta": 18.55
  }
}
```

## Tool Discovery Lessons

Do not assume the first Figma tool list is complete.

The first selected search exposed only design context tools. A broader tool discovery query revealed the required screenshot tool.

Use tool discovery like this:

```text
tool_search query: Figma get_screenshot screenshot PNG selection node capture
```

The successful cloud tool was:

```text
mcp__codex_apps__figma._get_screenshot
```

The useful signature:

```json
{
  "fileKey": "SlhonORmySdoSMTQgDWw3w",
  "nodeId": "239:713",
  "maxDimension": 2048,
  "contentsOnly": true,
  "enableBase64Response": false
}
```

The response returned JSON with:

```json
{
  "image_url": "https://www.figma.com/api/mcp/asset/...",
  "width": 844,
  "height": 212,
  "format": "png",
  "original_width": 844,
  "original_height": 212
}
```

It also returned a curl command. Use the URL/curl path by default because it avoids dumping base64 image data into the model context.

Download command pattern:

```powershell
New-Item -ItemType Directory -Force output\visual-compare | Out-Null
curl.exe -L -o output\visual-compare\timeline-figma-239-713.png "https://www.figma.com/api/mcp/asset/<asset-id>"
```

Important: the URL is short-lived and should be treated as secret. Do not store it in repo files.

## Figma MCP Tool Precedence

The skill should teach agents to prefer these routes in order:

1. Cloud screenshot route:

```text
mcp__codex_apps__figma._get_screenshot
```

Use when `fileKey` and `nodeId` are known. This returns a short-lived image URL plus exact width/height metadata.

2. Desktop screenshot route:

```text
mcp__figma.get_screenshot
```

Use when the Figma desktop MCP is active and the current file/selection is reliable, or when the cloud tool is unavailable.

3. Design context route:

```text
mcp__codex_apps__figma._get_design_context
mcp__figma.get_design_context
```

Use for context and implementation guidance. It may include an inline screenshot, but it is not the preferred artifact route because persisting the image is less direct than the screenshot tool’s URL/curl output.

4. Plugin API route:

```text
mcp__codex_apps__figma._use_figma
```

Use only when a node-level script is needed, e.g. `await node.screenshot()`, or when modifying/creating Figma nodes. Before using `use_figma`, load the `figma-use` instructions and pass `skillNames: "figma-use"`.

## Bounds and Size Matching

Size matching is mandatory.

The Figma screenshot tool returns:

```text
width
height
original_width
original_height
```

The live capture must use the same pixel dimensions unless there is a deliberate, documented reason to compare a larger responsive breakpoint.

For exact parity capture:

```text
viewport.width  = figma.width
viewport.height = figma.height
deviceScaleFactor = 1
fullPage = false
```

For the timeline example:

```text
Figma: 844x212
Live viewport: 844x212
Live screenshot: 844x212
```

Do not compare an unconstrained desktop screenshot against a fixed-size Figma component. That creates false positives and hides real layout issues.

## Live Capture Command Pattern

Use Playwright. Prefer a Node script because it gives exact viewport control, console diagnostics, WebGL flags, and stable output naming.

In the VaultSpec Dashboard frontend, this script was run from:

```text
Y:\code\vaultspec-dashboard-worktrees\main\frontend
```

Capture script pattern:

```powershell
@'
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outputDir = resolve('..', 'output', 'visual-compare');
mkdirSync(outputDir, { recursive: true });
const screenshotPath = resolve(outputDir, 'timeline-live-844x212.png');

const browser = await chromium.launch({
  headless: true,
  args: [
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
  ],
});

const page = await browser.newPage({
  viewport: { width: 844, height: 212 },
  deviceScaleFactor: 1,
});

await page.goto('http://127.0.0.1:5176/timeline.html', {
  waitUntil: 'domcontentloaded',
});

await page.waitForTimeout(6500);

const diagnostics = await page.evaluate(() => {
  const text = document.body.innerText;
  const graphField = document.querySelector('[data-timeline-graph-field]');
  const canvas = document.querySelector('canvas');
  const legend = document.querySelector('[data-timeline-field-legend]');
  const debug = document.querySelector('[data-timeline-debug]');
  const controls = document.querySelector('[data-timeline-controls]');
  const rect = document.documentElement.getBoundingClientRect();

  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    document: { width: rect.width, height: rect.height },
    controls: Boolean(controls),
    graphField: Boolean(graphField),
    canvas: Boolean(canvas),
    legend: legend?.textContent ?? null,
    debug: debug?.textContent ?? null,
    fallbackText: text.includes('does not support the required WebGL'),
    loading: text.includes('reading the timeline'),
    empty: text.includes('No timeline documents'),
    error: text.includes('could not load'),
  };
});

await page.screenshot({ path: screenshotPath, fullPage: false });
await browser.close();

console.log(JSON.stringify({ screenshotPath, diagnostics }, null, 2));
'@ | node --input-type=module
```

WebGL note:

The first generic Playwright browser attempt produced WebGL fallback errors. The reliable flags were:

```text
--ignore-gpu-blocklist
--enable-webgl
--use-gl=swiftshader
--enable-unsafe-swiftshader
```

A valid capture must report:

```json
{
  "fallbackText": false,
  "loading": false,
  "error": false
}
```

For graph/canvas views, also check that the relevant canvas and host selectors exist.

## Comparison Artifact Generation

The successful compositor used browser-native Canvas through Playwright. This avoids adding native packages like `canvas`, `sharp`, `pngjs`, or `jimp`.

The native `canvas` package was not installed in this repo, so do not rely on it.

Browser compositor command pattern:

```powershell
@'
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const out = resolve('..', 'output', 'visual-compare');
mkdirSync(out, { recursive: true });

const figmaPath = resolve(out, 'timeline-figma-239-713.png');
const livePath = resolve(out, 'timeline-live-844x212.png');
const figmaUrl = `data:image/png;base64,${readFileSync(figmaPath).toString('base64')}`;
const liveUrl = `data:image/png;base64,${readFileSync(livePath).toString('base64')}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1800, height: 600 },
  deviceScaleFactor: 1,
});

const result = await page.evaluate(async ({ figmaUrl, liveUrl }) => {
  function load(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`failed to load ${src.slice(0, 48)}`));
      img.src = src;
    });
  }

  function pngBuffer(dataUrl) {
    return dataUrl.split(',')[1];
  }

  const figma = await load(figmaUrl);
  const live = await load(liveUrl);
  const width = Math.max(figma.naturalWidth, live.naturalWidth);
  const height = Math.max(figma.naturalHeight, live.naturalHeight);

  const split = document.createElement('canvas');
  split.width = width * 2 + 1;
  split.height = height + 26;
  let ctx = split.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, split.width, split.height);
  ctx.fillStyle = '#312d28';
  ctx.font = '12px sans-serif';
  ctx.fillText('Figma', 8, 17);
  ctx.fillText('Live', width + 17, 17);
  ctx.fillStyle = '#fdfaf6';
  ctx.fillRect(0, 26, width, height);
  ctx.drawImage(figma, 0, 26);
  ctx.fillStyle = '#d8d0c7';
  ctx.fillRect(width, 26, 1, height);
  ctx.fillStyle = '#fdfaf6';
  ctx.fillRect(width + 1, 26, width, height);
  ctx.drawImage(live, width + 1, 26);

  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  ctx = overlay.getContext('2d');
  ctx.fillStyle = '#fdfaf6';
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(figma, 0, 0);
  ctx.globalAlpha = 0.55;
  ctx.drawImage(live, 0, 0);
  ctx.globalAlpha = 1;

  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  ctx = source.getContext('2d');
  ctx.fillStyle = '#fdfaf6';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(figma, 0, 0);
  const figmaData = ctx.getImageData(0, 0, width, height);
  ctx.fillStyle = '#fdfaf6';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(live, 0, 0);
  const liveData = ctx.getImageData(0, 0, width, height);

  const diff = document.createElement('canvas');
  diff.width = width;
  diff.height = height;
  ctx = diff.getContext('2d');
  const diffData = ctx.createImageData(width, height);

  let changed = 0;
  let total = 0;
  let sum = 0;

  for (let i = 0; i < diffData.data.length; i += 4) {
    const dr = Math.abs(figmaData.data[i] - liveData.data[i]);
    const dg = Math.abs(figmaData.data[i + 1] - liveData.data[i + 1]);
    const db = Math.abs(figmaData.data[i + 2] - liveData.data[i + 2]);
    const delta = Math.max(dr, dg, db);

    sum += delta;
    total += 1;
    if (delta > 24) changed += 1;

    diffData.data[i] = delta > 24 ? 206 : 250;
    diffData.data[i + 1] = delta > 24 ? Math.max(35, 200 - delta) : 246;
    diffData.data[i + 2] = delta > 24 ? 44 : 240;
    diffData.data[i + 3] = 255;
  }

  ctx.putImageData(diffData, 0, 0);

  return {
    dimensions: {
      figma: { width: figma.naturalWidth, height: figma.naturalHeight },
      live: { width: live.naturalWidth, height: live.naturalHeight },
      compare: { width, height },
    },
    pixelDelta: {
      changedPixelsOver24: changed,
      totalPixels: total,
      changedRatio: Number((changed / total).toFixed(4)),
      meanMaxChannelDelta: Number((sum / total).toFixed(2)),
    },
    images: {
      split: pngBuffer(split.toDataURL('image/png')),
      overlay: pngBuffer(overlay.toDataURL('image/png')),
      diff: pngBuffer(diff.toDataURL('image/png')),
    },
  };
}, { figmaUrl, liveUrl });

await browser.close();

const artifacts = {
  split: resolve(out, 'timeline-split-844x212.png'),
  overlay: resolve(out, 'timeline-overlay-alpha-844x212.png'),
  diff: resolve(out, 'timeline-diff-844x212.png'),
};

for (const [name, b64] of Object.entries(result.images)) {
  writeFileSync(artifacts[name], Buffer.from(b64, 'base64'));
}

const report = {
  figma: { path: figmaPath, ...result.dimensions.figma },
  live: { path: livePath, ...result.dimensions.live },
  compare: result.dimensions.compare,
  artifacts,
  pixelDelta: result.pixelDelta,
};

writeFileSync(resolve(out, 'timeline-visual-compare-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
'@ | node --input-type=module
```

## Static HTML Review Page

The skill should generate an optional no-server HTML review page:

```text
<slug>-visual-compare.html
```

Required content:

1. Direct overlay section.
2. Opacity slider controlling the live image opacity.
3. Split view image.
4. Pixel difference image.
5. Captions naming Figma source and live source.

The page should use relative paths to local artifacts so it can be opened directly from Explorer.

Minimal behavior:

```js
const opacity = document.querySelector("#opacity");
const opacityValue = document.querySelector("#opacityValue");
const live = document.querySelector("#live");

opacity.addEventListener("input", () => {
  live.style.opacity = opacity.value;
  opacityValue.value = Number(opacity.value).toFixed(2);
});
```

## Output Location Rule

Default output root:

```text
output/visual-compare/
```

Allow override with:

```text
--out <directory>
```

Never write comparison artifacts into `src/`, `frontend/src/`, or a design-system folder.

If project rules require scoped reclaimable dev artifacts, keep everything under `output/visual-compare/` or another explicit dev artifact path.

## File Naming Rule

Use stable, descriptive names. Include:

1. A user-facing slug.
2. The artifact role.
3. Dimensions for live/compare artifacts.
4. Figma node id when useful.

Recommended pattern:

```text
<slug>-figma-<node-id-with-hyphen>.png
<slug>-live-<width>x<height>.png
<slug>-split-<width>x<height>.png
<slug>-overlay-alpha-<width>x<height>.png
<slug>-diff-<width>x<height>.png
<slug>-visual-compare-report.json
<slug>-visual-compare.html
```

Example:

```text
timeline-figma-239-713.png
timeline-live-844x212.png
timeline-split-844x212.png
timeline-overlay-alpha-844x212.png
timeline-diff-844x212.png
timeline-visual-compare-report.json
timeline-visual-compare.html
```

## Proposed Skill Folder Schema

Create:

```text
figma-visual-parity/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── references/
│   ├── figma-mcp-capture.md
│   ├── live-browser-capture.md
│   ├── bounds-and-naming.md
│   └── visual-comparison-artifacts.md
└── scripts/
    ├── capture-live-page.mjs
    ├── compare-pngs.mjs
    └── write-review-page.mjs
```

Keep `SKILL.md` short. It should tell the agent:

1. Resolve the Figma node and capture it through MCP screenshot.
2. Download the Figma PNG locally.
3. Capture the live route at the exact Figma dimensions.
4. Generate split, overlay, diff, report, and optional HTML review page.
5. Inspect the generated images before declaring success.
6. Report concrete visual deltas, not just artifact paths.

Move tool details and scripts into references/scripts.

## Proposed `SKILL.md` Frontmatter

```yaml
---
name: figma-visual-parity
description: Capture Figma design nodes and live frontend implementations as dimension-matched PNGs, then generate split-view, direct-overlay, pixel-diff, JSON report, and static HTML review artifacts. Use when Codex must visually verify a UI against Figma, compare a local dev route to a Figma node, produce visual parity evidence, or enforce a visual verification gate for frontend work.
---
```

## Proposed `SKILL.md` Body Outline

```markdown
# Figma Visual Parity

Use this skill to produce hard visual evidence that a live UI matches or diverges from a Figma node.

## Workflow

1. Identify `fileKey`, `nodeId`, live URL, output slug, and output directory.
2. Capture the Figma node with the MCP screenshot tool. Prefer the URL/curl path.
3. Download the Figma PNG locally using the standard filename.
4. Read the Figma PNG dimensions from the MCP response.
5. Capture the live page at the exact same viewport dimensions with `deviceScaleFactor: 1`.
6. Generate split, overlay, diff, and report artifacts.
7. Generate a static HTML review page unless the user asks not to.
8. Inspect the images. Report concrete visual differences.

## References

- For Figma MCP tool selection and screenshot capture, read `references/figma-mcp-capture.md`.
- For Playwright live route capture and WebGL flags, read `references/live-browser-capture.md`.
- For output paths, naming, and dimension rules, read `references/bounds-and-naming.md`.
- For split/overlay/diff generation, read `references/visual-comparison-artifacts.md`.
```

## Script Requirements

### `scripts/capture-live-page.mjs`

Inputs:

```text
--url
--width
--height
--out
--wait-ms
--selector optional
--webgl optional true/false
```

Behavior:

1. Launch Chromium.
2. If `--webgl` is enabled, include SwiftShader/WebGL flags.
3. Set viewport to exact width/height and `deviceScaleFactor: 1`.
4. Navigate to URL.
5. Wait for timeout or selector.
6. Capture screenshot with `fullPage: false`.
7. Print JSON diagnostics.

### `scripts/compare-pngs.mjs`

Inputs:

```text
--figma
--live
--slug
--out
--threshold default 24
```

Behavior:

1. Load both PNGs in browser-native Canvas through Playwright, or another available deterministic image library.
2. Verify dimensions. If mismatched, either fail or record exact scaling behavior. Default should fail.
3. Generate split PNG.
4. Generate alpha overlay PNG.
5. Generate diff PNG.
6. Generate JSON report.

### `scripts/write-review-page.mjs`

Inputs:

```text
--slug
--out
--figma-label
--live-label
```

Behavior:

1. Write a static HTML file under the output directory.
2. Reference local artifacts by relative path.
3. Include opacity slider for direct overlay.
4. Include split and diff images.

## Validation Requirements

The skill is not complete until it is validated on a real Figma node and a real local route.

Validation should prove:

```text
Figma PNG exists
Live PNG exists
Dimensions match
Split PNG exists
Overlay PNG exists
Diff PNG exists
Report JSON exists
HTML review page exists
Agent visually inspected at least split and overlay
Agent reported concrete deltas
```

The validation run can reuse:

```text
fileKey: SlhonORmySdoSMTQgDWw3w
nodeId: 239:713
live URL: http://127.0.0.1:5176/timeline.html
expected Figma dimensions: 844x212
```

## Important Failure Modes to Encode

1. **Tool discovery was incomplete.**
   - If the screenshot tool does not appear, search again broadly.
   - Query: `Figma get_screenshot screenshot PNG selection node capture`

2. **Inline design context is not enough.**
   - `get_design_context` may show an image, but the hard gate requires local PNG files.

3. **WebGL can fail in headless browser.**
   - Use SwiftShader flags.
   - Require diagnostics to prove no WebGL fallback text is present.

4. **Viewport mismatch invalidates the overlay.**
   - Capture live at Figma dimensions.
   - Use `deviceScaleFactor: 1`.
   - Use `fullPage: false`.

5. **Debug overlays can pollute parity.**
   - This is useful, not a failure. The overlay should reveal whether debug UI occupies design-critical surface area.
   - Report it plainly.

6. **Do not add native image dependencies unless needed.**
   - Browser Canvas through Playwright is sufficient.

7. **Do not store short-lived Figma asset URLs.**
   - Store only the downloaded PNG and source metadata.

## What Success Looks Like

A successful agent response after using the finished skill should say something like:

```text
Captured Figma node 239:713 from SlhonORmySdoSMTQgDWw3w at 844x212.
Captured live route http://127.0.0.1:5176/timeline.html at 844x212.
Generated split, overlay, diff, report, and HTML review artifacts under output/visual-compare.
Inspected the overlay. The live implementation diverges from the design because the debug panel and field legend occupy the design-sized surface, and the graph body compresses into the central band.
```

## Handoff Task for the Next Agent

Create the `figma-visual-parity` skill using the schema above. Use the skill creator workflow:

1. Initialize the skill in the appropriate skills directory.
2. Keep `SKILL.md` concise.
3. Put detailed Figma MCP, Playwright capture, naming, and comparison procedures into `references/`.
4. Implement deterministic scripts for live capture, PNG comparison, and HTML review-page generation.
5. Validate the skill on the VaultSpec timeline example.
6. Run the skill validation command for skill structure.
7. Report paths to the created skill and validation artifacts.

Do not continue dashboard implementation while doing this. The only deliverable is the reusable skill and its validation artifacts.
