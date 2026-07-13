// @vitest-environment happy-dom is NOT needed (pure adapter unit tests on captured samples).
// Split from liveAdapters.test.ts (module-decomposition mandate, 2026-07-12).

import { describe, expect, it } from "vitest";
import {
  GIT_CHANGED_FILES_MAX_ROWS,
  GIT_DIFF_LINE_MAX_CHARS,
  GIT_DIFF_MAX_HUNKS,
  GIT_DIFF_MAX_LINES,
  GIT_OP_OUTPUT_MAX_CHARS,
  GIT_OP_VERB_MAX_CHARS,
  GIT_PATH_MAX_CHARS,
  adaptGitOp,
  mergeNumstat,
  normalizeGitDiffStatus,
  parseGitNumstat,
  parseGitStatus,
  parseUnifiedDiff,
  unwrapEnvelope,
} from "./index";
import { TIERS } from "./testFixtures";

describe("adaptGitOp + /ops/git consumer fidelity (W05.P12.S64)", () => {
  // Live `/ops/git/{verb}` envelopes: git output forwarded verbatim under
  // `{data: {verb, output}, tiers}`.
  const liveStatus = {
    data: {
      verb: "status",
      output: "## main\n M .vault/plan/2026-01-05-editor-demo-plan.md\n",
    },
    tiers: TIERS,
  };
  const liveDiff = {
    data: {
      verb: "diff",
      output:
        "diff --git a/x.md b/x.md\n--- a/x.md\n+++ b/x.md\n@@ -1,1 +1,1 @@\n-old\n+new\n",
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live git status + diff envelopes verbatim", () => {
    const status = adaptGitOp(unwrapEnvelope(liveStatus));
    expect(status.verb).toBe("status");
    // Porcelain per-file `XY path` line forwarded verbatim.
    expect(status.output).toContain(" M .vault/plan/");
    const diff = adaptGitOp(unwrapEnvelope(liveDiff));
    expect(diff.verb).toBe("diff");
    expect(diff.output).toContain("@@ -1,1 +1,1 @@");
    expect(diff.output).toContain("+new");
  });

  it("bounds git op verb and output at the adapter boundary", () => {
    const adapted = adaptGitOp({
      verb: "x".repeat(GIT_OP_VERB_MAX_CHARS + 1),
      output: "d".repeat(GIT_OP_OUTPUT_MAX_CHARS + 1),
      tiers: TIERS,
    });

    expect(adapted.verb).toBe("");
    expect(adapted.output).toHaveLength(GIT_OP_OUTPUT_MAX_CHARS);
    expect(adapted.truncated).toEqual({
      returned_chars: GIT_OP_OUTPUT_MAX_CHARS,
      reason: "git output ceiling",
    });
  });
});

describe("git output parsers (git-diff-browser W06.P19.S72)", () => {
  it("parses porcelain-v1 status into status-grouped changed-file entries", () => {
    // A porcelain-v1 sample exercising each XY status: branch header (skipped),
    // a worktree modify, a staged add, a worktree delete, a rename, untracked.
    const output =
      "## main...origin/main [ahead 1]\n" +
      " M src/a.ts\n" +
      "A  src/new.ts\n" +
      " D src/gone.ts\n" +
      "R  src/old.ts -> src/renamed.ts\n" +
      "?? .vault/scratch.md\n";
    const files = parseGitStatus(output);
    expect(files.map((f) => [f.path, f.group, f.letter])).toEqual([
      ["src/a.ts", "modified", "M"],
      ["src/new.ts", "staged", "A"],
      ["src/gone.ts", "deleted", "D"],
      ["src/renamed.ts", "renamed", "R"], // rename tracks the NEW path
      [".vault/scratch.md", "untracked", "?"],
    ]);
    // The vault corpus entry carries the vault flag; the others do not.
    expect(files.find((f) => f.path === ".vault/scratch.md")!.vault).toBe(true);
    expect(files.find((f) => f.path === "src/a.ts")!.vault).toBe(false);
  });

  it("drops malformed porcelain status rows before they reach changed-files state", () => {
    const overlongPath = "x".repeat(GIT_PATH_MAX_CHARS + 1);
    const output =
      "## main\n" +
      "   \n" +
      " M    \n" +
      "ZZ src/bad-code.ts\n" +
      "M\tsrc/bad-separator.ts\n" +
      "!! ignored.tmp\n" +
      "R  src/old.ts ->    \n" +
      ` M ${overlongPath}\n` +
      " M src/ok.ts\n";

    expect(parseGitStatus(output).map((f) => f.path)).toEqual(["src/ok.ts"]);
  });

  it("bounds changed-file status and numstat accumulators", () => {
    const statusOutput = Array.from(
      { length: GIT_CHANGED_FILES_MAX_ROWS + 1 },
      (_, index) => ` M src/file-${index}.ts`,
    ).join("\n");
    const status = parseGitStatus(statusOutput);
    expect(status).toHaveLength(GIT_CHANGED_FILES_MAX_ROWS);
    expect(status.at(-1)?.path).toBe(`src/file-${GIT_CHANGED_FILES_MAX_ROWS - 1}.ts`);

    const numstatOutput = Array.from(
      { length: GIT_CHANGED_FILES_MAX_ROWS + 1 },
      (_, index) => `1\t0\tsrc/file-${index}.ts`,
    ).join("\n");
    const tallies = parseGitNumstat(numstatOutput);
    expect(tallies.size).toBe(GIT_CHANGED_FILES_MAX_ROWS);
    expect(tallies.has(`src/file-${GIT_CHANGED_FILES_MAX_ROWS}.ts`)).toBe(false);
  });

  it("parses numstat tallies and reconciles them onto status entries (binary → null)", () => {
    const numstat = "3\t1\tsrc/a.ts\n-\t-\timg/logo.png\n";
    const tallies = parseGitNumstat(numstat);
    expect(tallies.get("src/a.ts")).toEqual({ adds: 3, dels: 1 });
    expect(tallies.get("img/logo.png")).toEqual({ adds: null, dels: null });
    const merged = mergeNumstat(parseGitStatus("## main\n M src/a.ts\n"), tallies);
    expect(merged[0]).toMatchObject({ path: "src/a.ts", adds: 3, dels: 1 });
  });

  it("distinguishes a binary entry (numstat -\\t- row) from an untracked entry (no row)", () => {
    // A binary file HAS a numstat row with both tallies null → binary; an
    // untracked file has NO numstat row → null tallies but NOT binary.
    const tallies = parseGitNumstat("-\t-\timg/logo.png\n");
    const merged = mergeNumstat(
      parseGitStatus("## main\n M img/logo.png\n?? notes/new.txt\n"),
      tallies,
    );
    const binary = merged.find((e) => e.path === "img/logo.png");
    const untracked = merged.find((e) => e.path === "notes/new.txt");
    expect(binary).toMatchObject({ adds: null, dels: null, binary: true });
    expect(untracked?.adds).toBeNull();
    expect(untracked?.dels).toBeNull();
    expect(untracked?.binary ?? false).toBe(false);
  });

  it("drops malformed numstat rows before reconciliation", () => {
    const tallies = parseGitNumstat(
      "abc\t1\tsrc/bad-adds.ts\n" +
        "1\tNaN\tsrc/bad-dels.ts\n" +
        "2\t0\t   \n" +
        "4\t2\tsrc/ok.ts\n",
    );

    expect([...tallies.keys()]).toEqual(["src/ok.ts"]);
    expect(tallies.get("src/ok.ts")).toEqual({ adds: 4, dels: 2 });
  });

  it("parses a unified diff into hunks with twin line numbers and per-line kinds", () => {
    const diff =
      "diff --git a/x.md b/x.md\n" +
      "index 1111111..2222222 100644\n" +
      "--- a/x.md\n+++ b/x.md\n" +
      "@@ -1,3 +1,3 @@\n" +
      " context line\n-old line\n+new line\n";
    const parsed = parseUnifiedDiff(diff, "x.md", "M");
    expect(parsed.path).toBe("x.md");
    expect(parsed.status).toBe("M");
    expect(parsed.binary).toBe(false);
    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0].header).toBe("@@ -1,3 +1,3 @@");
    // Twin gutters advance correctly: context on both sides at line 1, the
    // removed line on the old side (2), the added line on the new side (2).
    expect(parsed.hunks[0].lines).toEqual([
      { kind: "context", old: 1, new: 1, text: "context line" },
      { kind: "remove", old: 2, new: null, text: "old line" },
      { kind: "add", old: null, new: 2, text: "new line" },
    ]);
  });

  it("bounds parsed unified diff hunks, lines, line text, and path identity", () => {
    const manyHunks = Array.from(
      { length: GIT_DIFF_MAX_HUNKS + 1 },
      (_, index) => `@@ -${index + 1} +${index + 1} @@\n line-${index}`,
    ).join("\n");
    const hunkCapped = parseUnifiedDiff(manyHunks, " diff.md ");
    expect(hunkCapped.path).toBe("diff.md");
    expect(hunkCapped.hunks).toHaveLength(GIT_DIFF_MAX_HUNKS);
    expect(hunkCapped.truncated).toEqual({
      total_hunks: GIT_DIFF_MAX_HUNKS + 1,
      returned_hunks: GIT_DIFF_MAX_HUNKS,
      reason: "hunk ceiling",
    });

    const lineCapped = parseUnifiedDiff(
      `@@ -1 +1 @@\n${Array.from(
        { length: GIT_DIFF_MAX_LINES + 1 },
        (_, index) => ` line-${index}`,
      ).join("\n")}`,
      "diff.md",
    );
    expect(lineCapped.hunks[0].lines).toHaveLength(GIT_DIFF_MAX_LINES);
    expect(lineCapped.truncated).toEqual({
      total_hunks: 1,
      returned_hunks: 1,
      reason: "line ceiling",
    });

    const longLine = "x".repeat(GIT_DIFF_LINE_MAX_CHARS + 1);
    const textCapped = parseUnifiedDiff(`@@ -1 +1 @@\n+${longLine}`, "diff.md");
    expect(textCapped.hunks[0].lines[0].text).toHaveLength(GIT_DIFF_LINE_MAX_CHARS);
    expect(textCapped.truncated).toEqual({
      total_hunks: 1,
      returned_hunks: 1,
      reason: "line length ceiling",
    });

    expect(parseUnifiedDiff("@@ -1 +1 @@\n same", "   ").path).toBe("");
  });

  it("normalizes optional git diff status letters at the adapter boundary", () => {
    const diff =
      "diff --git a/x.md b/x.md\n" +
      "--- a/x.md\n+++ b/x.md\n" +
      "@@ -1 +1 @@\n" +
      "-old\n+new\n";

    expect(normalizeGitDiffStatus(" m ")).toBe("M");
    expect(normalizeGitDiffStatus("??")).toBeUndefined();
    expect(normalizeGitDiffStatus({ status: "M" })).toBeUndefined();
    expect(parseUnifiedDiff(diff, "x.md", " r ").status).toBe("R");
    expect(parseUnifiedDiff(diff, "x.md", "renamed").status).toBeUndefined();
  });

  it("reports a binary file as binary with no hunks", () => {
    const diff =
      "diff --git a/logo.png b/logo.png\n" +
      "Binary files a/logo.png and b/logo.png differ\n";
    const parsed = parseUnifiedDiff(diff, "logo.png");
    expect(parsed.binary).toBe(true);
    expect(parsed.hunks).toHaveLength(0);
  });
});

describe("historical text-diff consumer fidelity (figma-parity-reconciliation S18)", () => {
  // A sample CAPTURED from the live `/ops/git/histdiff` wire: a two-rev unified
  // diff forwarded VERBATIM inside `{data: {verb, output}, tiers}`. Fed through
  // the SAME unwrap + adapter path the app uses verifies the historical diff route.
  const liveHistDiff = {
    data: {
      verb: "histdiff",
      output:
        "diff --git a/.vault/plan/x.md b/.vault/plan/x.md\n" +
        "index 1111111..3333333 100644\n" +
        "--- a/.vault/plan/x.md\n+++ b/.vault/plan/x.md\n" +
        "@@ -1,1 +1,1 @@\n" +
        "-original line\n+rewritten line\n",
    },
    tiers: TIERS,
  };

  it("unwraps + adapts the live historical-diff envelope verbatim", () => {
    const diff = adaptGitOp(unwrapEnvelope(liveHistDiff));
    expect(diff.verb).toBe("histdiff");
    // The two-rev unified diff is forwarded verbatim; both edits are present.
    expect(diff.output).toContain("@@ -1,1 +1,1 @@");
    expect(diff.output).toContain("-original line");
    expect(diff.output).toContain("+rewritten line");
    expect(diff.tiers.semantic.available).toBe(false);
  });
});
