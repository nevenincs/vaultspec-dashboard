# Live browser capture

Capture the live route at the **exact** Figma dimensions with Playwright/Chromium.

## Command

Substitute your own live URL, dimensions, and output name.

```
node ${CLAUDE_SKILL_DIR}/scripts/capture-live-page.mjs \
  --url <your-live-url> \
  --width <w> --height <h> \
  --out output/visual-compare/<slug>-live-<w>x<h>.png \
  --wait-ms 6500
```

Optional flags:

- `--selector "<css>"` — wait for a specific element before capturing (the deterministic
  readiness signal; prefer it over a fixed `--wait-ms` when the page has an async render).
- `--no-webgl` — disable the WebGL/SwiftShader launch flags for plain DOM pages.

The script enforces parity capture settings: viewport `width x height`,
`deviceScaleFactor: 1`, `fullPage: false`.

## WebGL note

Headless Chromium often fails WebGL on machines without a GPU. The script launches
with SwiftShader flags by default so WebGL/canvas content (e.g. PixiJS) renders:

```
--ignore-gpu-blocklist --enable-webgl --use-gl=swiftshader --enable-unsafe-swiftshader
```

The script prints a diagnostics block. A valid capture must report:

```json
{ "webglFallback": false, "hasCanvas": true, "selectorFound": true, "bodyTextSample": "..." }
```

If `webglFallback` is true the capture does not reflect the rendered design — fix
the environment before comparing. `hasCanvas` matters only for canvas/graph views;
`selectorFound` is `null` unless you passed `--selector`. `bodyTextSample` is the
first 200 characters of visible text — read it to confirm the page rendered real
content rather than a loading or error state (the script does not guess app-specific
states for you).

## Cross-platform / Playwright resolution

The script is pure Node (`.mjs`) and runs identically on Windows, macOS, and Linux.
It locates `@playwright/test` by searching upward from the working directory, a few
conventional web-app subdirectories (`frontend`, `web`, `app`, `client`, `ui`,
`site`), and the skill location. If Playwright is installed somewhere unusual, point
the resolver at it:

```
FIGMA_PARITY_PLAYWRIGHT=/path/to/project node .../capture-live-page.mjs ...
```

If Playwright is missing entirely:

```
npm install --save-dev @playwright/test && npx playwright install chromium
```

## Debug overlays

Debug panels, legends, and dev HUDs that occupy the design surface are not a script
failure — they are exactly what the overlay should reveal. Report them plainly
("the debug panel occupies the top band where the design shows the title row")
rather than treating the run as broken.
