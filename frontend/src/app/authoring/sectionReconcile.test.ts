// Section three-way reconcile tests (editor-change-fidelity D12). Pure over three
// document strings — no wire, no store. The load-bearing property: the user's bytes
// are never silently replaced by the agent's.

import { describe, expect, it } from "vitest";

import { partitionSegments, reconcileSections } from "./sectionReconcile";

const DOC = (a: string, b: string) => `## Alpha\n\n${a}\n\n## Beta\n\n${b}\n`;

describe("partitionSegments", () => {
  it("cuts at heading boundaries and keeps a leading pseudo-section", () => {
    const segs = partitionSegments("intro\n\n## Alpha\n\nbody\n");
    expect(segs.map((s) => s.text)).toEqual(["intro\n\n", "## Alpha\n\nbody\n"]);
  });

  it("emits no pseudo-section when the doc starts at a heading", () => {
    const segs = partitionSegments("## Alpha\n\nbody\n");
    expect(segs).toHaveLength(1);
  });
});

describe("reconcileSections — disjoint", () => {
  it("takes the agent's section and keeps the user's, in new-base order", () => {
    const oldBase = DOC("alpha", "beta");
    const newBase = DOC("ALPHA-agent", "beta"); // agent changed Alpha only
    const draft = DOC("alpha", "beta-user"); // user changed Beta only
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("disjoint");
    if (result.kind !== "disjoint") return;
    // Alpha adopts the agent's bytes; Beta keeps the user's.
    expect(result.mergedDraft).toBe(DOC("ALPHA-agent", "beta-user"));
  });

  it("keeps an untouched section verbatim", () => {
    const oldBase = DOC("alpha", "beta");
    const newBase = DOC("ALPHA-agent", "beta");
    const draft = DOC("alpha", "beta"); // clean would not reach here, but merge is stable
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("disjoint");
    if (result.kind !== "disjoint") return;
    expect(result.mergedDraft).toBe(DOC("ALPHA-agent", "beta"));
  });

  it("merges a user-added section (present in draft, absent from both bases)", () => {
    const oldBase = "## Alpha\n\nalpha\n";
    const newBase = "## Alpha\n\nALPHA-agent\n"; // agent changed Alpha
    const draft = "## Alpha\n\nalpha\n\n## New\n\nmine\n"; // user added a section
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("disjoint");
    if (result.kind !== "disjoint") return;
    // Agent's Alpha + the user's new section, appended.
    expect(result.mergedDraft).toBe("## Alpha\n\nALPHA-agent\n## New\n\nmine\n");
  });
});

describe("reconcileSections — conflict (never silently overwrites)", () => {
  it("flags a section both sides changed as a conflict", () => {
    const oldBase = DOC("alpha", "beta");
    const newBase = DOC("ALPHA-agent", "beta"); // agent changed Alpha
    const draft = DOC("alpha-user", "beta"); // user ALSO changed Alpha
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("conflict");
    if (result.kind !== "conflict") return;
    expect(result.conflictKeys).toHaveLength(1);
  });

  it("keeps the user's bytes for an unresolved conflict (safe default)", () => {
    const oldBase = DOC("alpha", "beta");
    const newBase = DOC("ALPHA-agent", "beta");
    const draft = DOC("alpha-user", "beta");
    const result = reconcileSections(oldBase, newBase, draft);
    if (result.kind !== "conflict") throw new Error("expected conflict");
    // No decision → the user's bytes survive, NEVER the agent's.
    expect(result.mergeWith({})).toBe(DOC("alpha-user", "beta"));
  });

  it("takes the agent's bytes only when the user explicitly chooses theirs", () => {
    const oldBase = DOC("alpha", "beta");
    const newBase = DOC("ALPHA-agent", "beta");
    const draft = DOC("alpha-user", "beta");
    const result = reconcileSections(oldBase, newBase, draft);
    if (result.kind !== "conflict") throw new Error("expected conflict");
    const key = result.conflictKeys[0];
    expect(result.mergeWith({ [key]: "theirs" })).toBe(DOC("ALPHA-agent", "beta"));
    expect(result.mergeWith({ [key]: "mine" })).toBe(DOC("alpha-user", "beta"));
  });

  it("denies user-deleted vs agent-modified to conflict (either direction)", () => {
    const oldBase = DOC("alpha", "beta");
    // User deleted Beta; agent modified Beta.
    const draft = "## Alpha\n\nalpha\n";
    const newBase = DOC("alpha", "BETA-agent");
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("conflict");
  });

  it("denies a duplicate section key to conflict", () => {
    // Two sections with the same heading path — ambiguous alignment.
    const oldBase = "## Dup\n\na\n\n## Dup\n\nb\n";
    const newBase = "## Dup\n\nA\n\n## Dup\n\nb\n";
    const draft = "## Dup\n\na\n\n## Dup\n\nB\n";
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("conflict");
  });
});

// The standard vault template shape: one H1 title owning every `##` subsection.
// `HeadingBlock.sectionText` spans the H1's whole SUBTREE (the comment-anchor
// hashing extent), so partitioning must cut FLAT — otherwise the H1 segment
// overlaps its children: every disjoint edit pair false-conflicts at the H1 key,
// and re-joining the resolved segments DUPLICATES each subsection (live-caught by
// the editor e2e suite over the real apply path).
describe("reconcileSections — H1-owning document (flat segmentation)", () => {
  const H1DOC = (alpha: string, gamma: string) =>
    `# title\n\nintro\n\n## Alpha\n\n${alpha}\n\n## Gamma\n\n${gamma}\n`;

  it("tiles the document exactly once — flat segments, no subtree overlap", () => {
    const segs = partitionSegments(H1DOC("alpha", "gamma"));
    expect(segs.map((s) => s.text).join("")).toBe(H1DOC("alpha", "gamma"));
    expect(segs.map((s) => s.text)).toEqual([
      "# title\n\nintro\n\n",
      "## Alpha\n\nalpha\n\n",
      "## Gamma\n\ngamma\n",
    ]);
  });

  it("rebases disjoint edits under a shared H1 instead of whole-doc conflicting", () => {
    const oldBase = H1DOC("alpha", "gamma");
    const newBase = H1DOC("ALPHA-agent", "gamma"); // agent changed Alpha only
    const draft = H1DOC("alpha", "gamma-user"); // user changed Gamma only
    const result = reconcileSections(oldBase, newBase, draft);
    expect(result.kind).toBe("disjoint");
    if (result.kind !== "disjoint") return;
    expect(result.mergedDraft).toBe(H1DOC("ALPHA-agent", "gamma-user"));
  });

  it("scopes an overlap to the contested subsection and merges without duplication", () => {
    const oldBase = H1DOC("alpha", "gamma");
    const newBase = H1DOC("ALPHA-agent", "gamma");
    const draft = H1DOC("alpha-user", "gamma");
    const result = reconcileSections(oldBase, newBase, draft);
    if (result.kind !== "conflict") throw new Error("expected conflict");
    expect(result.conflictKeys).toEqual(['["title","Alpha"]']);
    expect(result.mergeWith({ '["title","Alpha"]': "mine" })).toBe(
      H1DOC("alpha-user", "gamma"),
    );
    expect(result.mergeWith({ '["title","Alpha"]': "theirs" })).toBe(
      H1DOC("ALPHA-agent", "gamma"),
    );
  });
});
