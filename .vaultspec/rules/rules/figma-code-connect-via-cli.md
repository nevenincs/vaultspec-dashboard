# Code Connect cross-mapping goes through the @figma/code-connect CLI, against the live file

## Rule

Cross-map Figma components to code with the `@figma/code-connect` **CLI**, not the MCP
Code Connect tools. Author `*.figma.tsx` (`figma.connect(Component, <node-url>, …)`),
validate with `npx figma connect parse` (ungated), and publish with
`npx figma connect publish` reading `FIGMA_ACCESS_TOKEN` from the gitignored
`frontend/.env` (PAT scopes: Code Connect = Write, File content = Read). Every
`<node-url>` MUST point at the LIVE design file `SlhonORmySdoSMTQgDWw3w`, never the
retired seed file `8WDmXNOURdRQwdefWNGsBb`. `frontend/figma/component-map.json` is the
node↔code registry of record and must track the live file's node IDs.

## Why

The MCP Code Connect tools and the CLI are DIFFERENT layers with different gating, proven
live in the 2026-06-16 figma-backend session: all four MCP tools
(`get_code_connect_map`, `get_code_connect_suggestions`, `add_code_connect_map`,
`get_context_for_code_connect`) returned "need a Developer seat in an Organization or
Enterprise plan" (server-side, with Figma debug UUIDs, matching Figma's published plan
matrix) — yet `npx figma connect publish --dry-run` on the SAME Pro account, with a PAT,
authenticated, enumerated all components, and reached node validation, i.e. past the
plan gate. The publish then failed only with `404 This file is unavailable` because the
registry's node URLs still pointed at the retired empty seed file
`8WDmXNOURdRQwdefWNGsBb` instead of the live `SlhonORmySdoSMTQgDWw3w`. So: trusting the
MCP tools' gate to conclude "Code Connect is blocked" is wrong; the CLI is the working
path; and stale seed-file node URLs are the real failure mode.

## How

- **Good:** `@figma/code-connect` as a frontend devDependency; `frontend/figma.config.json`
  (react parser, `include` the connect dir + `src` so source paths resolve); author
  `frontend/figma/connect/<Component>.figma.tsx`; `npx figma connect parse` to validate;
  PAT in gitignored `frontend/.env`; `npx figma connect publish` (load `.env`,
  `--dry-run` first).
- **Good:** every `figma.connect(..., "https://www.figma.com/design/SlhonORmySdoSMTQgDWw3w?node-id=<id>")`
  resolves against the LIVE file; re-point `component-map.json` node IDs whenever the
  design file's structure changes.
- **Bad:** calling the MCP `add_code_connect_map`/`get_code_connect_map`, hitting the
  Enterprise-plan error, and declaring Code Connect unavailable — that is the wrong layer.
- **Bad:** publishing node URLs that resolve to `8WDmXNOURdRQwdefWNGsBb` (retired) — they
  404 at validation. Bad: committing the PAT — keep it in gitignored `.env`; rotate if leaked.

## Source

figma-backend session 2026-06-16: the MCP-vs-CLI Code Connect split discovered live (the
dry-run reaching node validation past the plan gate; the 404 traced to stale seed-file node
URLs in `component-map.json`). Sibling rules `design-system-is-centralized`,
`mock-mirrors-live-wire-shape`.
