// Unit tests for the section-anchor derivation (authoring-surface W02.P05). These
// prove the reader's selector math mirrors the engine EXACTLY: the git blob oid
// matches git's own well-known values (so it equals `ingest_struct::reader::blob_oid`
// and the backend's fence), the heading-section parse matches
// `authoring::sections::parse_heading_sections`, and the H1-lift anchor index maps a
// rendered heading's plugin path back to the full raw block. Pure — the live wire is
// exercised separately in `sectionAnchor.live.test.ts`.

import { describe, expect, it } from "vitest";

import {
  buildCommentAnchorIndex,
  gitBlobOid,
  headingPathKey,
  parseHeadingBlocks,
} from "./sectionAnchor";

const DOC =
  "# Title\n\nintro\n\n## Alpha\n\nalpha body\n\n### Alpha Detail\n\nnested\n\n## Beta\n\nbeta body\n";

describe("gitBlobOid", () => {
  it("matches git's well-known empty-blob and 'hello\\n' object ids", async () => {
    // The canonical `git hash-object` values — proof the digest is the git blob oid
    // (sha1("blob " + len + "\\0" + bytes)), byte-for-byte what the backend fences on.
    expect(await gitBlobOid("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
    expect(await gitBlobOid("hello\n")).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
  });

  it("hashes over UTF-8 bytes, not UTF-16 code units", async () => {
    // A multi-byte character must not change the hash relative to the byte-length
    // header the backend computes — a smoke test that the encoder path is byte-based.
    expect((await gitBlobOid("café\n")).length).toBe(40);
  });
});

describe("parseHeadingBlocks", () => {
  it("resolves ancestor-inclusive paths and heading-through-nested-content sections", () => {
    const blocks = parseHeadingBlocks(DOC);
    const byLeaf = (leaf: string) =>
      blocks.find((b) => b.path[b.path.length - 1] === leaf);

    expect(byLeaf("Alpha")!.path).toEqual(["Title", "Alpha"]);
    // A section runs from its heading line through the next same-or-shallower heading.
    expect(byLeaf("Alpha")!.sectionText).toBe(
      "## Alpha\n\nalpha body\n\n### Alpha Detail\n\nnested\n\n",
    );
    expect(byLeaf("Alpha Detail")!.path).toEqual(["Title", "Alpha", "Alpha Detail"]);
    expect(byLeaf("Beta")!.sectionText).toBe("## Beta\n\nbeta body\n");
    // The single H1 runs to EOF (nothing at level <= 1 follows it).
    expect(byLeaf("Title")!.sectionText).toBe(DOC);
  });

  it("never treats a heading-looking line inside a fenced code block as a heading", () => {
    const doc = "# Title\n\n```\n# not a heading\n```\n\n## Real\n\nbody\n";
    const leaves = parseHeadingBlocks(doc).map((b) => b.path[b.path.length - 1]);
    expect(leaves).toEqual(["Title", "Real"]);
  });

  it("requires the ATX space and a 1-6 hash run (mirrors the engine's parse)", () => {
    // `#tag` is not a heading (no space); `####### x` is 7 hashes (over the cap).
    const leaves = parseHeadingBlocks("#tag\n\n####### x\n\n## Ok\n").map(
      (b) => b.path[b.path.length - 1],
    );
    expect(leaves).toEqual(["Ok"]);
  });
});

describe("buildCommentAnchorIndex", () => {
  it("maps the lifted-H1-stripped plugin path back to the full raw block", () => {
    // The reader lifts the H1 title, so the plugin's paths omit it; the index keys on
    // that stripped path while the value keeps the full raw path + section bytes.
    const index = buildCommentAnchorIndex(DOC, true);

    const alpha = index.byPluginPath.get(headingPathKey(["Alpha"]));
    expect(alpha).toBeDefined();
    expect(alpha!.path).toEqual(["Title", "Alpha"]);
    expect(alpha!.sectionText.startsWith("## Alpha")).toBe(true);

    expect(
      index.byPluginPath.get(headingPathKey(["Alpha", "Alpha Detail"])),
    ).toBeDefined();
    expect(index.byPluginPath.get(headingPathKey(["Beta"]))!.path).toEqual([
      "Title",
      "Beta",
    ]);
    // The lifted title itself is never a commentable (rendered) heading.
    expect(index.byPluginPath.get(headingPathKey(["Title"]))).toBeUndefined();
  });

  it("keeps full paths as keys when no H1 was lifted", () => {
    const index = buildCommentAnchorIndex(DOC, false);
    expect(index.byPluginPath.get(headingPathKey(["Title", "Alpha"]))!.path).toEqual([
      "Title",
      "Alpha",
    ]);
    // Without a lift, the bare stripped key does not resolve.
    expect(index.byPluginPath.get(headingPathKey(["Alpha"]))).toBeUndefined();
  });

  it("flags a duplicated heading path as ambiguous", () => {
    // Two sections with the same full path — the reader cannot tell them apart and
    // the backend would resolve their selector as an ambiguous anchor.
    const doc = "# Title\n\n## Dup\n\nfirst\n\n## Dup\n\nsecond\n";
    const index = buildCommentAnchorIndex(doc, true);
    expect(index.ambiguousPaths.has(headingPathKey(["Dup"]))).toBe(true);
    // A unique heading is never flagged.
    expect(index.ambiguousPaths.has(headingPathKey(["Alpha"]))).toBe(false);
  });
});
