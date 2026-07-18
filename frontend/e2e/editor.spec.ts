// Editor change-fidelity LIVE-UI acceptance (live-ui-testing): drives the REAL
// app — the engine-served SPA over a scratch corpus (`./editor/harness.ts`) — with
// Playwright, and stages REAL agent applies through the authoring ledger while the
// editor is open, proving the editor-change-fidelity epic's UI end to end:
//
//   W01  GitHub syntax highlighting in the markdown editor + theme switching
//        (light/dark/high-contrast) through the real command palette.
//   W03  User change markers (added/modified/removed) in the gutter, rendered as
//        flow children of `[data-highlight-line]` (wrap-correct by construction).
//   W05  Next/previous-change navigation on Ctrl+Alt+ArrowDown/ArrowUp.
//   D11  Agent provenance marks (origin=agent + unseen dot) that SURVIVE user
//        edits elsewhere and reclassify to user marks when the user touches them.
//   D12  The dirty reconcile: disjoint sections auto-rebase (user bytes kept
//        verbatim); an overlapping section raises the ConflictResolutionPanel
//        with save STRUCTURALLY disabled — the user is never silently
//        overwritten — and "Keep my version" resolves it.
//   W10  The durable acknowledge route over the staged changeset.
//   W06  Read-only code viewer: syntax highlighting + git dirty-diff markers.
//
// Evidence: numbered full-page screenshots under
// `test-results/editor-evidence/` — one per proven capability.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { AuthoringClient } from "./authoring/client";
import {
  type EngineHandle,
  removeFixtureWorktree,
  stopEngine,
} from "./authoring/engine";
import {
  EDITOR_DOC,
  type EditorFixture,
  createEditorFixture,
  spawnEditorEngine,
  stageAgentApply,
  stripFrontmatter,
} from "./editor/harness";

test.describe.configure({ mode: "serial" });

const EVIDENCE = "test-results/editor-evidence";

let fixture: EditorFixture;
let engine: EngineHandle;
let client: AuthoringClient;
let scope: string;
let agentToken: string;
let reviewerToken: string;
let page: Page;

/** The editor buffer holds the WHOLE file (frontmatter + body). The saved base
 *  is read from the scratch worktree's disk — the exact bytes the engine serves
 *  and fences on — so scenario inputs can never drift from reality. */
const diskBase = (): string =>
  readFileSync(join(fixture.root, ...EDITOR_DOC.path.split("/")), "utf8");

const editorTextarea = () => page.locator("[data-highlighted-editor] textarea");

async function fillDraft(value: string): Promise<void> {
  await editorTextarea().fill(value);
}

/** Distinct computed colors over the visible syntax tokens — a genuine
 *  multi-color highlight (not one flat ink) proves the theme is applied. */
async function distinctTokenColors(): Promise<string[]> {
  return page.evaluate(() => {
    const colors = new Set<string>();
    for (const el of document.querySelectorAll("[data-highlight-token]")) {
      colors.add(getComputedStyle(el as HTMLElement).color);
    }
    return [...colors];
  });
}

async function switchThemeViaPalette(commandLabel: string): Promise<void> {
  // Leave the textarea so the global keymap sees the chord, then open the
  // real command palette and run the theme command like a user would.
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog");
  const paletteInput = palette.getByRole("combobox");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill(commandLabel);
  await palette.getByRole("option", { name: commandLabel }).first().click();
}

test.beforeAll(async ({ browser }) => {
  fixture = createEditorFixture();
  engine = await spawnEditorEngine(fixture.root);
  client = new AuthoringClient(engine.baseUrl, engine.token);
  scope = await client.activeScope();
  agentToken = await client.issueActorToken("agent:e2e-editor-agent", "agent");
  reviewerToken = await client.issueActorToken("human:e2e-editor-reviewer", "human");
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page?.close();
  await stopEngine(engine);
  removeFixtureWorktree(fixture.root);
});

test("the engine-served shell boots and the fixture doc opens in the editor", async () => {
  await page.goto(engine.baseUrl);
  await expect(page.locator('meta[name="vaultspec-token"]')).toHaveAttribute(
    "content",
    /.+/,
  );
  // Open the doc from the real corpus tree: Documents → Plans → the doc row.
  await page.getByRole("button", { name: /^Documents\s*1$/ }).click();
  await page
    .getByRole("button", { name: /^Plans\s*1$/ })
    .last()
    .click();
  await page.getByText("e2e-editor-doc").first().dblclick();
  // The reader chrome mounts with the View/Edit segmented control.
  await expect(page.getByRole("radio", { name: "Edit" })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/01-shell-doc-open.png`, fullPage: true });
});

test("W01: the markdown editor renders real multi-color syntax highlighting", async () => {
  await page.getByRole("radio", { name: "Edit" }).click();
  await expect(editorTextarea()).toBeVisible();
  await expect(editorTextarea()).toHaveValue(diskBase());
  // Shiki tokenizes async; poll until the token layer is painted.
  await expect
    .poll(async () => (await distinctTokenColors()).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: `${EVIDENCE}/02-syntax-light.png`, fullPage: true });
});

test("W01: dark and high-contrast themes restyle the same tokens", async () => {
  const lightColors = await distinctTokenColors();

  await switchThemeViaPalette("Use dark theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(async () => {
      const dark = await distinctTokenColors();
      return dark.length >= 2 && dark.join() !== lightColors.join();
    })
    .toBe(true);
  await page.screenshot({ path: `${EVIDENCE}/03-syntax-dark.png`, fullPage: true });

  await switchThemeViaPalette("Use high contrast theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "high-contrast");
  await expect
    .poll(async () => (await distinctTokenColors()).length)
    .toBeGreaterThanOrEqual(2);
  await page.screenshot({
    path: `${EVIDENCE}/04-syntax-high-contrast.png`,
    fullPage: true,
  });

  await switchThemeViaPalette("Use light theme");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("W03: user edits mark the gutter — modified, added, and removed, wrap-correct", async () => {
  const draft = diskBase()
    .replace("alpha line one", "alpha line one, user-modified")
    .replace("beta line two\n", "beta line two\nbeta line user-added\n")
    .replace("gamma line two\n", "");
  await fillDraft(draft);

  const modified = page.locator(
    '[data-change-marker="modified"][data-change-origin="user"]',
  );
  const added = page.locator('[data-change-marker="added"][data-change-origin="user"]');
  const removed = page.locator(
    '[data-change-marker="removed"][data-change-origin="user"]',
  );
  await expect(modified.first()).toBeAttached();
  await expect(added.first()).toBeAttached();
  await expect(removed.first()).toBeAttached();
  // D5 tokens carry the diff tier classes.
  await expect(modified.first()).toHaveClass(/bg-diff-modified/);
  await expect(added.first()).toHaveClass(/bg-diff-add/);
  // Wrap-correctness by construction: every marker is a flow CHILD of its
  // `[data-highlight-line]` block, so it tracks the line through soft-wrap.
  const orphanMarkers = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("[data-change-marker]")).filter(
        (el) => !el.parentElement?.hasAttribute("data-highlight-line"),
      ).length,
  );
  expect(orphanMarkers).toBe(0);
  await page.screenshot({ path: `${EVIDENCE}/05-user-markers.png`, fullPage: true });
});

test("W05: Ctrl+Alt+ArrowDown/ArrowUp walk the caret across the changes", async () => {
  const textarea = editorTextarea();
  await textarea.focus();
  await textarea.evaluate((el) => {
    (el as HTMLTextAreaElement).setSelectionRange(0, 0);
  });
  const caretLine = () =>
    textarea.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return t.value.slice(0, t.selectionStart).split("\n").length - 1;
    });

  await page.keyboard.press("Control+Alt+ArrowDown");
  const first = await caretLine();
  await page.keyboard.press("Control+Alt+ArrowDown");
  const second = await caretLine();
  expect(first).toBeGreaterThan(0);
  expect(second).toBeGreaterThan(first);

  await page.keyboard.press("Control+Alt+ArrowUp");
  expect(await caretLine()).toBe(first);

  // Reset the draft to the saved base; the gutter empties with it.
  await fillDraft(diskBase());
  await expect(page.locator("[data-change-marker]")).toHaveCount(0);
});

test("D11: an agent apply under a CLEAN open editor adopts the base and marks provenance", async () => {
  const agentBody = stripFrontmatter(diskBase()).replace(
    "beta line one",
    "beta line one, agent-improved",
  );
  await stageAgentApply(client, scope, fixture, agentToken, reviewerToken, agentBody);
  // The SSE re-ingest refreshes the open editor's content query; the D2 clean
  // arm adopts the new base in place.
  await expect(editorTextarea()).toHaveValue(
    new RegExp("beta line one, agent-improved"),
    { timeout: 30_000 },
  );
  // The adopted change carries agent provenance AND the unseen dot (D5/D6).
  const agentMark = page.locator('[data-change-marker][data-change-origin="agent"]');
  await expect(agentMark.first()).toBeAttached();
  await expect(page.locator("[data-change-unseen]").first()).toBeAttached();
  await page.screenshot({
    path: `${EVIDENCE}/06-agent-marks-unseen.png`,
    fullPage: true,
  });
});

test("D11: agent marks survive user edits elsewhere and reclassify when touched", async () => {
  // A user edit in Gamma — far from the agent's Beta change.
  await fillDraft(diskBase().replace("gamma line one", "gamma line one, user-touched"));
  const agentMark = page.locator('[data-change-marker][data-change-origin="agent"]');
  const userMark = page.locator('[data-change-marker][data-change-origin="user"]');
  // Both provenances coexist: the agent mark projected into the new line space.
  await expect(agentMark.first()).toBeAttached();
  await expect(userMark.first()).toBeAttached();
  await page.screenshot({
    path: `${EVIDENCE}/07-anchor-stability.png`,
    fullPage: true,
  });

  // Touching the agent's own line reclassifies THAT line as the user's (D11
  // merge law: a user run wins every line it touches) — other agent marks
  // (untouched lines of the same apply) rightly keep their provenance.
  await fillDraft(
    diskBase().replace("beta line one, agent-improved", "beta line user-rewrote"),
  );
  const rewrittenLine = page.locator("[data-highlight-line]", {
    hasText: "beta line user-rewrote",
  });
  await expect(
    rewrittenLine.locator('[data-change-marker][data-change-origin="user"]'),
  ).toBeAttached();
  await expect(
    rewrittenLine.locator('[data-change-marker][data-change-origin="agent"]'),
  ).toHaveCount(0);

  // A draft reset clears the USER marks; the agent provenance stays (it derives
  // from the retained baseline, not the draft) until save or acknowledgement.
  await fillDraft(diskBase());
  await expect(userMark).toHaveCount(0);
});

test("D12 disjoint: an agent apply under a DIRTY draft auto-rebases, keeping user bytes", async () => {
  // The user dirties Gamma…
  const userDraft = diskBase().replace(
    "gamma line two",
    "gamma line two, user-in-progress",
  );
  await fillDraft(userDraft);
  // …while the agent lands a change in Alpha (a DISJOINT section).
  const agentBody = stripFrontmatter(diskBase()).replace(
    "alpha line two",
    "alpha line two, agent-rebased",
  );
  await stageAgentApply(client, scope, fixture, agentToken, reviewerToken, agentBody);

  // The draft rebases in place: BOTH the user's Gamma bytes (verbatim) and the
  // agent's Alpha bytes; no conflict surface appears.
  await expect(editorTextarea()).toHaveValue(
    new RegExp("alpha line two, agent-rebased"),
    { timeout: 30_000 },
  );
  await expect(editorTextarea()).toHaveValue(
    new RegExp("gamma line two, user-in-progress"),
  );
  await expect(page.locator("[data-editor-conflict-panel]")).toHaveCount(0);
  await page.screenshot({
    path: `${EVIDENCE}/08-disjoint-rebase.png`,
    fullPage: true,
  });

  await fillDraft(diskBase());
  await expect(
    page.locator('[data-change-marker][data-change-origin="user"]'),
  ).toHaveCount(0);
});

let overlapChangeset: { changesetId: string; approvalId: string };

test("D12 overlap: the conflict panel appears, save is disabled, and the user is never overwritten", async () => {
  // The user is editing Alpha…
  const userDraft = diskBase().replace(
    "alpha line one",
    "alpha line one, MY unsaved words",
  );
  await fillDraft(userDraft);
  // …and the agent applies a DIFFERENT change to the SAME section.
  const agentBody = stripFrontmatter(diskBase()).replace(
    "alpha line one",
    "alpha line one, the agent's version",
  );
  overlapChangeset = await stageAgentApply(
    client,
    scope,
    fixture,
    agentToken,
    reviewerToken,
    agentBody,
  );

  // The overlap arm: the resolution surface appears; the draft bytes are HELD.
  const panel = page.locator("[data-editor-conflict-panel]");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(editorTextarea()).toHaveValue(
    new RegExp("alpha line one, MY unsaved words"),
  );
  // The save path is structurally disabled while the conflict is pending.
  const saveButton = page.getByRole("button", { name: "Save document" });
  await expect(saveButton).toBeDisabled();
  await page.screenshot({
    path: `${EVIDENCE}/09-conflict-panel.png`,
    fullPage: true,
  });

  // Resolve: keep MY version. The panel completes, my bytes stand, save re-arms.
  await panel.getByRole("button", { name: "Keep my version" }).click();
  await expect(panel).toHaveCount(0);
  await expect(editorTextarea()).toHaveValue(
    new RegExp("alpha line one, MY unsaved words"),
  );
  await expect(saveButton).toBeEnabled();
  await page.screenshot({
    path: `${EVIDENCE}/10-conflict-resolved-mine.png`,
    fullPage: true,
  });
});

test("W10: the durable acknowledge route records the after-fact acknowledgement", async () => {
  const { changesetId, approvalId } = overlapChangeset;
  const ack = await client.send(
    "POST",
    `/authoring/v1/proposals/${changesetId}/acknowledge`,
    {
      actorToken: reviewerToken,
      body: {
        api_version: "v1",
        command: "acknowledge",
        idempotency_key: "idem:ack:overlap",
        payload: {
          changeset_id: changesetId,
          approval_id: approvalId,
          comment: "seen in the editor e2e",
        },
      },
    },
  );
  expect(ack.status, ack.raw).toBe(200);
});

test("W06: the read-only code viewer highlights syntax and marks the git dirty diff", async () => {
  // Switch the corpus tree to Files and open the dirtied code file.
  await page.getByRole("radio", { name: "Files" }).click();
  await page.getByRole("button", { name: "src", exact: true }).click();
  await page.getByText("sample.ts").first().dblclick();

  // The code surface tokenizes with real colors…
  await expect
    .poll(async () => (await distinctTokenColors()).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  // …and the saved-vs-committed diff marks the modified and added lines.
  await expect(page.locator('[data-change-marker="modified"]').first()).toBeAttached({
    timeout: 30_000,
  });
  await expect(page.locator('[data-change-marker="added"]').first()).toBeAttached();
  await page.screenshot({
    path: `${EVIDENCE}/11-code-dirty-diff.png`,
    fullPage: true,
  });
});
