# Figma MCP capture

Goal: obtain a PNG of a specific Figma node plus its exact pixel width/height.

## Tool discovery first

Do not assume the first tool list is complete. The screenshot tool is often not in
the default Figma tool surface. If you do not see a screenshot tool, search again
broadly:

```
tool discovery query: Figma get_screenshot screenshot PNG selection node capture
```

## Tool precedence

Tool names differ by runtime. Match whichever your harness exposes:

| Route | Claude Code name | Codex/cloud name | Use when |
| :-- | :-- | :-- | :-- |
| 1. Screenshot (preferred) | `mcp__figma__get_screenshot` | `mcp__codex_apps__figma._get_screenshot` | `fileKey` + `nodeId` known. Returns a short-lived image URL + exact width/height. |
| 2. Desktop screenshot | `mcp__figma.get_screenshot` | — | Figma desktop MCP active and current selection is reliable, or cloud tool unavailable. |
| 3. Design context | `mcp__figma__get_design_context` | `mcp__codex_apps__figma._get_design_context` | Implementation guidance/context. May include an inline image, but it does not write a file on disk — use the screenshot route for the artifact. |
| 4. Plugin API | `mcp__figma__use_figma` | `mcp__codex_apps__figma._use_figma` | Node-level scripting (`await node.screenshot()`) or creating/editing nodes. Load the `figma-use` skill first (`skillNames: "figma-use"`). |

**Inline design context is not enough.** `get_design_context` may show an image, but
the hard gate requires local PNG files on disk. Use the screenshot route.

## Screenshot request

Substitute the `fileKey` and `nodeId` of the node you are verifying. Both come from
the node's figma.com URL: `figma.com/design/<fileKey>?node-id=<nodeId>` (the URL
hyphenates the node id, e.g. `12-345`; the API wants the colon form `12:345`).

```json
{
  "fileKey": "<your-figma-file-key>",
  "nodeId": "<your-node-id>",
  "maxDimension": 2048,
  "contentsOnly": true,
  "enableBase64Response": false
}
```

Set `enableBase64Response: false` so the tool returns a URL instead of dumping
base64 image data into the model context.

## Response

```json
{
  "image_url": "https://www.figma.com/api/mcp/asset/<asset-id>",
  "width": <px>,
  "height": <px>,
  "format": "png",
  "original_width": <px>,
  "original_height": <px>
}
```

Record `width`/`height` — the live capture must match them exactly.

## Download (cross-platform)

The asset URL is **short-lived and must be treated as secret**: pass it on the
command line, never write it into a repo file. Download with the bundled Node
helper (works on Windows, macOS, Linux — no `curl`/PowerShell dependency):

```
node ${CLAUDE_SKILL_DIR}/scripts/fetch-figma-asset.mjs \
  --url "<image_url>" \
  --out output/visual-compare/<slug>-figma-<node-id-with-hyphen>.png
```

In the filename, hyphenate the node id (a node id `12:345` becomes `12-345`).
Store only the downloaded PNG and the `fileKey`/`nodeId`/dimensions metadata.

A reference PNG you were handed (rather than captured here) can keep its own name —
you do not have to rename it to your output slug. See
[Externally-supplied reference files](bounds-and-naming.md#externally-supplied-reference-files)
in `references/bounds-and-naming.md`.
