// Editor live-UI e2e harness (live-ui-testing): the fixture + staging layer for
// `editor.spec.ts`, which proves the editor-change-fidelity epic's UI (syntax
// highlighting, change markers, change navigation, agent-mark anchor stability,
// dirty-overlap reconcile, the acknowledge route) in the REAL running app.
//
// Composition, not reinvention: the engine spawn/teardown recipe is the existing
// `../authoring/engine.ts` harness (scratch git worktree, OS-assigned free port,
// `--no-seat`, service.json token poll). What THIS module adds:
//
//   1. An editor-shaped fixture corpus — a multi-heading-section plan document
//      (the D12 section three-way needs several disjoint sections to rebase
//      across) and a committed-then-dirtied code file (the W06 read-only
//      dirty-diff needs a genuine uncommitted git change).
//   2. SPA serving: the scratch engine also serves the BUILT frontend bundle
//      (`VAULTSPEC_SPA_DIR` → `frontend/dist`, the engine's documented dev
//      passthrough), so Playwright drives the real single-origin app — token
//      meta tag, real stores wire, real SSE — against the scratch corpus. No
//      real `.vault/` document is ever touched.
//   3. Agent staging: `stageAgentApply` drives the REAL authoring ledger
//      (propose → submit → human approve → apply) over the wire while the
//      browser holds the document open in the editor — the deterministic way to
//      stage "an agent changed the document under you" that manual driving
//      cannot. The apply lands new base bytes on disk; the engine's re-ingest
//      invalidates the content query over SSE; the editor's one reconcile
//      dispatcher (MarkdownDocView) takes the D2/D11/D12 arm under test.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { AuthoringClient, str } from "../authoring/client";
import {
  type EngineHandle,
  type FixtureDoc,
  git,
  gitBlob,
  spawnEngine,
} from "../authoring/engine";
import { resolveExecutable } from "../../src/testing/processControl";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SPA_DIST = join(REPO_ROOT, "frontend", "dist");
const VAULTSPEC_CORE_BIN = resolveExecutable("vaultspec-core");

/** The editor-under-test document: enough heading sections for the D12 section
 *  three-way to have disjoint AND overlapping arms to exercise. */
export const EDITOR_DOC: FixtureDoc = {
  nodeId: "doc:e2e-editor-doc",
  stem: "e2e-editor-doc",
  path: ".vault/plan/e2e-editor-doc.md",
  docType: "plan",
};

export const EDITOR_DOC_BODY = `---
tags:
  - '#plan'
  - '#e2e-editor'
date: '2026-01-06'
---

# e2e-editor-doc

intro paragraph before the first section

## Alpha

alpha line one
alpha line two

## Beta

beta line one
beta line two

## Gamma

gamma line one
gamma line two
`;

/** The committed base of the code file; the fixture dirties it AFTER the commit
 *  so the read-only viewer's git dirty-diff (W06) has real uncommitted hunks. */
export const CODE_FILE_REL = "src/sample.ts";

export const CODE_FILE_COMMITTED = `export function greet(name: string): string {
  return \`hello \${name}\`;
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export const ANSWER = 42;
`;

export const CODE_FILE_DIRTY = `export function greet(name: string): string {
  return \`hi there \${name}\`;
}

export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

export function twice(n: number): number {
  return n * 2;
}

export const ANSWER = 42;
`;

export interface EditorFixture {
  readonly root: string;
  /** The document's CURRENT worktree base revision, freshly hashed. */
  readonly baseOf: (doc: FixtureDoc) => string;
}

/** A scratch git worktree with the editor corpus: the multi-section plan doc
 *  committed clean, the code file committed then DIRTIED in the worktree. */
export function createEditorFixture(): EditorFixture {
  const root = mkdtempSync(join(tmpdir(), "vaultspec-editor-e2e-"));
  const docAbs = join(root, ...EDITOR_DOC.path.split("/"));
  mkdirSync(dirname(docAbs), { recursive: true });
  writeFileSync(docAbs, EDITOR_DOC_BODY);
  const codeAbs = join(root, ...CODE_FILE_REL.split("/"));
  mkdirSync(dirname(codeAbs), { recursive: true });
  writeFileSync(codeAbs, CODE_FILE_COMMITTED);
  // Provision the scratch as a REAL vaultspec workspace (the same step the
  // vitest live harness runs): the authoring apply path materializes through a
  // `vaultspec-core` subprocess, which requires the workspace scaffolding — an
  // unprovisioned vault records the receipt but cannot write the document.
  const install = spawnSync(VAULTSPEC_CORE_BIN, ["install", "--target", root], {
    stdio: "pipe",
  });
  if (install.status !== 0) {
    throw new Error(
      `vaultspec-core install failed (${install.status}): ${install.stderr?.toString() ?? ""}`,
    );
  }
  writeFileSync(
    join(root, ".gitignore"),
    ".vault/data/\n.vault/logs/\n.vault/.obsidian/\n.vault/.trash/\n",
  );
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "e2e editor fixture"]);
  // Dirty the code file AFTER the commit: the W06 saved-vs-committed diff.
  writeFileSync(codeAbs, CODE_FILE_DIRTY);
  return { root, baseOf: (doc) => gitBlob(root, doc.path) };
}

/** Spawn the scratch engine WITH SPA serving: the engine's `VAULTSPEC_SPA_DIR`
 *  passthrough points at the repo's built bundle, so the spawned origin serves
 *  the full app (with the DF-6 token meta tag) beside the API. Fail-loud when
 *  the bundle is missing — a stale/absent dist would test the wrong UI. */
export async function spawnEditorEngine(root: string): Promise<EngineHandle> {
  try {
    statSync(join(SPA_DIST, "index.html"));
  } catch {
    throw new Error(
      `no built SPA bundle at ${SPA_DIST} — run \`npm run build\` in frontend/ first`,
    );
  }
  process.env["VAULTSPEC_SPA_DIR"] = SPA_DIST;
  return spawnEngine(root);
}

/** The `replace_body` draft carries BODY bytes only — the core materialization
 *  composes the frontmatter itself (and stamps `modified:`); proposing bytes
 *  that include frontmatter doubles it in the written file. */
export function stripFrontmatter(fileBytes: string): string {
  const match = /^---\n[\s\S]*?\n---\n\n?/.exec(fileBytes);
  return match ? fileBytes.slice(match[0].length) : fileBytes;
}

export interface StagedApply {
  readonly changesetId: string;
  readonly approvalId: string;
}

let stageCounter = 0;

/** Stage a REAL agent apply under the open editor: agent proposes a whole-body
 *  replacement against the CURRENT worktree base, a distinct human reviewer
 *  approves (clearing the self-approval ban), and the apply materializes the new
 *  bytes through the ledger. Returns the ids so the spec can later drive the W10
 *  acknowledge route against the same changeset. */
export async function stageAgentApply(
  client: AuthoringClient,
  scope: string,
  fixture: EditorFixture,
  agentToken: string,
  reviewerToken: string,
  body: string,
): Promise<StagedApply> {
  stageCounter += 1;
  const tag = `stage-${stageCounter}`;
  const changesetId = `changeset_editor_${tag}`;
  const base = fixture.baseOf(EDITOR_DOC);

  const session = await client.createSession(agentToken, `idem:session:${tag}`);
  const created = await client.createProposal(
    agentToken,
    session,
    scope,
    EDITOR_DOC,
    changesetId,
    `idem:create:${tag}`,
    base,
    body,
  );
  if (created.status !== 200 || created.data["status"] !== "draft") {
    throw new Error(`stageAgentApply create failed: ${created.raw}`);
  }
  const revision = str(created.data, "changeset_revision");

  const submitted = await client.submitForReview(
    agentToken,
    changesetId,
    revision,
    `idem:submit:${tag}`,
  );
  if (submitted.status !== 200) {
    throw new Error(`stageAgentApply submit failed: ${submitted.raw}`);
  }
  const proposalId = str(submitted.data, "proposal_id");
  const approvalId = str(submitted.data, "approval", "approval_id");
  const reviewed = str(submitted.data, "reviewed_revision");

  const decided = await client.decideReview(
    reviewerToken,
    approvalId,
    proposalId,
    reviewed,
    "approve",
    `idem:approve:${tag}`,
  );
  if (decided.status !== 200 || decided.data["status"] !== "decided") {
    throw new Error(`stageAgentApply approve failed: ${decided.raw}`);
  }

  const applied = await client.apply(
    reviewerToken,
    changesetId,
    approvalId,
    `idem:apply:${tag}`,
  );
  if (applied.status !== 200 || applied.data["receipt"] === undefined) {
    throw new Error(`stageAgentApply apply failed: ${applied.raw}`);
  }
  // Deterministic barrier: the apply materializes through a core subprocess;
  // wait until the worktree bytes actually moved off the pre-apply base, so a
  // UI wait that follows is unambiguously about the UI, not the write.
  const deadline = Date.now() + 15_000;
  while (fixture.baseOf(EDITOR_DOC) === base) {
    if (Date.now() > deadline) {
      throw new Error(
        `stageAgentApply: the applied changeset ${changesetId} never changed the worktree bytes`,
      );
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { changesetId, approvalId };
}
