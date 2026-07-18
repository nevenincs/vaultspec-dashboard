---
tags:
  - '#reference'
  - '#live-ui-testing'
date: '2026-07-18'
modified: '2026-07-18'
related:
  - '[[2026-07-17-editor-change-fidelity-adr]]'
  - '[[2026-07-16-agentic-authoring-ux-adr]]'
  - '[[2026-07-12-authoring-surface-adr]]'
---

# `live-ui-testing` reference: `editor live-UI acceptance framework`

The repeatable live-UI testing framework that proves the editor-change-fidelity
epic in the REAL running app — entry command `npm run e2e:editor` (from
`frontend/`), implemented as a self-contained Playwright project:
`frontend/playwright.editor.config.ts`, `frontend/e2e/editor.spec.ts`, and
`frontend/e2e/editor/harness.ts`. Built 2026-07-18; its first full run
live-caught and fixed a real D12 defect (flat-segmentation, below).

## Summary

### Architecture: three composed layers, no new test plane

- **Engine layer (reused).** The harness composes the existing authoring e2e
  spawn recipe (`frontend/e2e/authoring/engine.ts`): a scratch git worktree
  under the OS temp dir, the freshest built engine binary
  (`engine/target/{release,debug}`, `VAULTSPEC_TEST_ENGINE_BIN` override),
  `vaultspec serve --no-seat` on an OS-assigned free port (the dev-ports
  rule's sanctioned ephemeral-port class), service-token poll, hard kill +
  scratch removal on teardown. Two additions were needed:
  `vaultspec-core install --target <scratch>` at fixture build (an
  unprovisioned vault records apply receipts but the core subprocess cannot
  materialize the write — the silent-failure mode that cost the first run),
  and `VAULTSPEC_SPA_DIR` pointed at `frontend/dist` so the spawned engine
  serves the BUILT app itself (single origin, DF-6 token meta tag). The
  framework therefore needs `npm run build` first and fails loud when the
  bundle is absent. Because the product fix under test ships in the bundle,
  a product-code change requires a rebuild before the e2e sees it.
- **Browser layer.** Playwright (`@playwright/test`, system Chrome channel,
  headless) drives the real UI: corpus tree (Documents → Plans → doc row,
  or the Files radio for code), the View/Edit control (a `radiogroup`
  "Document mode" with radios "View"/"Edit"), the command palette
  (`Control+K`, a `role=dialog` wrapping a `role=combobox`) for theme
  switching. SwiftShader flags (`--use-angle=swiftshader` etc.) keep the
  WebGL graph canvas alive headless. One serial worker, one shared page —
  the scenarios build on each other.
- **Staging layer (the hard part).** Concurrency features (D11/D12) need an
  agent to change the document WHILE the editor holds it open. The framework
  stages this over the REAL wire with the existing e2e `AuthoringClient`
  (`frontend/e2e/authoring/client.ts`): issue agent + human actor tokens →
  create session → `create_proposal` (`replace_body`, whole-document) →
  submit → distinct-human approve (clearing the self-approval ban) → apply.
  A disk-level barrier then polls `git hash-object` until the worktree bytes
  move, so the UI wait that follows is unambiguously about the UI. The
  engine's re-ingest invalidates the open editor's content query over SSE,
  and the one reconcile dispatcher in `MarkdownDocView.tsx` takes the
  D2/D11/D12 arm under test. Alternatives rejected: driving the in-app agent
  panel (needs a live LLM run — nondeterministic, slow) and a test seam
  (violates the tests-exercise-the-live-wire rule; the ledger IS the
  production write path, so the wire staging is the honest mechanism).

### Contracts the suite depends on

- Wire: `POST /authoring/v1/{actor-tokens,sessions,proposals,…/submit,
  reviews/…/decisions,apply-requests}`; `POST
  /authoring/v1/proposals/{changeset_id}/acknowledge` (W10; command
  `acknowledge`, payload `changeset_id` + `approval_id`); `GET /map` for the
  scope token. `replace_body` drafts carry BODY bytes only — core composes
  frontmatter and stamps `modified:`; proposing full-file bytes doubles the
  frontmatter (`stripFrontmatter` in the harness guards this).
- DOM: `[data-highlighted-editor] textarea` (the buffer holds the WHOLE file,
  frontmatter included); `[data-highlight-token]` (computed `color` proves
  the active theme); `[data-highlight-line]` with `[data-change-marker]`
  flow children (`added|modified|removed` × `data-change-origin=user|agent`,
  `bg-diff-*` classes, `[data-change-unseen]` dot);
  `[data-editor-conflict-panel]` with `[data-conflict-section]` rows and the
  "Keep my version" / "Use the agent's version" buttons; the "Save document"
  button's disabled state (the D12 structural save guard); `html[data-theme]`.
- Determinism: scenario inputs are always derived from the scratch file's
  CURRENT disk bytes (`diskBase()`), never hand-maintained strings, so core
  materialization details (the `modified:` stamp) can never drift the
  fixtures; agent-mark assertions are line-scoped because an apply
  legitimately marks frontmatter lines too.

### What is proven live (all 11 scenarios green, ~17s after boot)

W01 multi-color GitHub highlighting in the markdown editor plus
light/dark/high-contrast switching through the real palette; W03 user
add/modify/remove gutter marks, wrap-correct by construction (every marker a
flow child of its line block); W05 `Ctrl+Alt+ArrowDown/ArrowUp` change
navigation moving the real caret; D11 agent provenance marks with the unseen
dot that survive user edits elsewhere and reclassify per line when touched;
D12 disjoint auto-rebase (user bytes verbatim + agent section adopted, no
conflict surface) and D12 overlap (conflict panel, save structurally
disabled, user bytes byte-for-byte preserved, "Keep my version" completes and
re-arms save); W10 acknowledge over the staged changeset; W06 read-only code
viewer highlighting + git dirty-diff markers over a committed-then-dirtied
`src/sample.ts`. Evidence: numbered full-page screenshots in
`frontend/test-results/editor-evidence/` (gitignored run artifacts).

### The defect the framework caught (and its fix)

`partitionSegments` in `src/app/authoring/sectionReconcile.ts` originally
reused `HeadingBlock.sectionText`, whose extent is the heading's whole
SUBTREE (the comment-anchor hashing extent). For an H1-owning document — the
standard vault template shape — the H1 segment overlapped every `##` child:
any disjoint user+agent edit pair false-conflicted at the H1 key, and
re-joining resolved segments DUPLICATED each subsection on resolution (a
byte-corrupting outcome, probed at 179 → 349 bytes). Every prior unit fixture
was flat `##`-only, so only the live path over a template-shaped document
could surface it. Fixed to flat cuts (heading start → next heading start of
ANY level, tiling the document exactly once); H1-shape regression tests added
to `sectionReconcile.test.ts`.

### Extending the framework

Add scenarios to `frontend/e2e/editor.spec.ts` (serial; later tests may
assume earlier state) or a sibling spec matched by widening `testMatch` in
`playwright.editor.config.ts`. Grow the corpus in
`createEditorFixture` (`frontend/e2e/editor/harness.ts`) — documents must be
template-valid for the doc-type; code files are committed then optionally
dirtied post-commit for dirty-diff scenarios. Stage more agent traffic with
`stageAgentApply` (it returns `changesetId`/`approvalId` for follow-on
review-plane calls). Keep three disciplines: derive every expected string
from `diskBase()`; wait on served/DOM state, never sleep; and screenshot each
new capability into the evidence directory.
