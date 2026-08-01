// @vitest-environment happy-dom
//
// The C4 stat card's TRUNCATION affordance (P07 review finding). The tally rules are
// covered purely in `ProposalDiffstat.test.ts`; what only a render can prove is that
// a floor is legible to the human deciding whether to approve.
//
// The finding this file answers: truncation honesty existed only as
// `data-diffstat-truncated`, which a reviewer cannot see. A count presented as exact
// when it is really a lower bound is the kind of quiet inaccuracy that gets a change
// approved on false information.
//
// This renders the REAL component, with the served detail seeded into the query
// cache so no wire is needed. A harness that re-implemented the component's markup
// would pass just as happily while the component itself was broken.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import {
  authoringKeys,
  type ProposalDetail,
  type ReviewDocumentProjection,
} from "../../stores/server/authoring";
import { ProposalDiffstat } from "./ProposalDiffstat";

const FLOOR_TEXT = "At least this many. The file was too large to read in full.";

function doc(
  childKey: string,
  base: string,
  proposed: string,
  truncated = false,
): ReviewDocumentProjection {
  return {
    child_key: childKey,
    document: { path: childKey },
    base: {
      text: base,
      truncated,
      total_bytes: base.length,
      returned_bytes: base.length,
    },
    proposed: {
      text: proposed,
      truncated: false,
      total_bytes: proposed.length,
      returned_bytes: proposed.length,
    },
  };
}

/** Render the real component with its served detail already in cache. */
async function renderStats(documents: ReviewDocumentProjection[], action?: ReactNode) {
  const changesetId = "changeset-diffstat";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(authoringKeys.proposal(changesetId), {
    proposal: { changeset_id: changesetId },
    review_documents: documents,
  } as unknown as ProposalDetail);
  const runtime = createTestLocalizationRuntime();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={client}>
        <ProposalDiffstat changesetId={changesetId} action={action} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  // With no documents there is no card to wait for — that absence is itself what
  // the action-hosting cases assert, so settle on the render instead.
  await waitFor(() =>
    expect(
      document.querySelector(
        documents.length === 0
          ? "[data-testid-root], body"
          : "[data-proposal-diffstat]",
      ),
    ).not.toBeNull(),
  );
  return view;
}

afterEach(cleanup);

describe("ProposalDiffstat", () => {
  it("renders the actual +X −Y numbers", async () => {
    // This shipped BROKEN and nothing caught it: the labels interpolated `count`,
    // which is i18next's reserved plural trigger, so a non-plural key sent the
    // resolver hunting for `_one`/`_other` siblings, found none, and fell back —
    // and the pair rendered nothing at all. The pure derivation test still passed,
    // because the numbers were correct right up to the point of display. So the
    // rendered digits are asserted here, not just the presence of a container.
    await renderStats([doc("a.md", "one\ntwo\n", "one\ntwo\nthree\nfour\n")]);
    const pair = document.querySelector(
      "[data-diffstat-file='a.md'] [data-diffstat-pair]",
    );
    expect(pair).not.toBeNull();
    expect(pair?.textContent).toContain("2");
    expect(pair?.textContent).toContain("+");
    expect(pair?.textContent).toContain("−");
  });

  it("names each changed file, splitting the directory from the filename", async () => {
    // The captured reference grammar renders the directory muted and the filename
    // dark, which is what makes a column of long paths scannable \u2014 the eye lands on
    // the part that identifies the file. Asserting the SPLIT (not merely that the
    // path appears somewhere) is what stops a well-meaning simplification back to
    // one flat string from silently undoing it.
    await renderStats([doc("docs/a.md", "one\n", "one\ntwo\n")]);
    const row = document.querySelector("[data-diffstat-file='docs/a.md']");
    expect(row).not.toBeNull();
    expect(row?.querySelector("[data-diffstat-directory]")?.textContent).toBe("docs/");
    expect(row?.querySelector("[data-diffstat-name]")?.textContent).toBe("a.md");
    // Still one readable path when the two halves are read together.
    expect(row?.textContent).toContain("docs/a.md");
  });

  it("gives a bare filename no directory half at all", async () => {
    // A root-level file must not render an empty muted span before its name.
    await renderStats([doc("README.md", "one\n", "one\ntwo\n")]);
    const row = document.querySelector("[data-diffstat-file='README.md']");
    expect(row?.querySelector("[data-diffstat-directory]")).toBeNull();
    expect(row?.querySelector("[data-diffstat-name]")?.textContent).toBe("README.md");
  });

  it("titles the card with the number of files the run edited", async () => {
    await renderStats([
      doc("a.md", "one\n", "one\ntwo\n"),
      doc("b.md", "one\n", "one\ntwo\n"),
    ]);
    expect(document.querySelector("[data-diffstat-title]")?.textContent).toBe(
      "Edited 2 files",
    );
  });

  it("says one file in the singular", async () => {
    await renderStats([doc("a.md", "one\n", "one\ntwo\n")]);
    expect(document.querySelector("[data-diffstat-title]")?.textContent).toBe(
      "Edited 1 file",
    );
  });
});

describe("ProposalDiffstat action hosting", () => {
  it("still renders the hosted action when there is no tally yet", async () => {
    // The action opens the diff, which exists whether or not the tally has been
    // computed. Letting it vanish with the stat cost a reviewer on a slow detail
    // read the only way to see what they were approving — so its presence is
    // pinned independently of the card's.
    await renderStats([], <button data-test-action>Review changes</button>);
    expect(document.querySelector("[data-proposal-diffstat]")).toBeNull();
    expect(document.querySelector("[data-test-action]")).not.toBeNull();
  });

  it("renders nothing at all when there is neither a tally nor an action", async () => {
    await renderStats([]);
    expect(document.querySelector("[data-proposal-diffstat]")).toBeNull();
    expect(document.querySelector("[data-diffstat-action-only]")).toBeNull();
  });
});

describe("ProposalDiffstat truncation affordance", () => {
  it("marks a truncated tally VISIBLY, not only as a data attribute", async () => {
    await renderStats([doc("big.md", "one\n", "one\ntwo\n", true)]);
    const pair = document.querySelector(
      "[data-diffstat-file='big.md'] [data-diffstat-pair]",
    );
    expect(pair?.hasAttribute("data-diffstat-truncated")).toBe(true);
    // The part the review finding was about: something a human can see and read,
    // not just an attribute a test can query.
    const floor = document.querySelector("[data-diffstat-floor]");
    expect(floor).not.toBeNull();
    // Readable words, not a bare glyph — and localized, so the marker travels.
    expect(floor?.textContent).toBe("Or more");
    expect(floor?.getAttribute("title")).toBe(FLOOR_TEXT);
    expect(pair?.getAttribute("title")).toBe(FLOOR_TEXT);
  });

  it("shows no floor marker when the counts are exact", async () => {
    // An exact tally must not carry a hedge — that understates real confidence just
    // as badly as the reverse overstates it.
    await renderStats([doc("small.md", "one\n", "one\ntwo\n", false)]);
    expect(document.querySelector("[data-diffstat-floor]")).toBeNull();
    expect(document.querySelector("[data-diffstat-pair]")?.hasAttribute("title")).toBe(
      false,
    );
  });

  it("carries the floor up to the AGGREGATE when any file was capped", async () => {
    // The headline number is the one a hurried reviewer reads. If any file was
    // capped, the total is a floor too, and it has to say so.
    await renderStats([
      doc("a.md", "one\n", "one\ntwo\n", true),
      doc("b.md", "one\n", "one\ntwo\n", false),
    ]);
    const pairs = document.querySelectorAll("[data-diffstat-pair]");
    // The first pair is the aggregate, then one per file.
    expect(pairs[0]?.hasAttribute("data-diffstat-truncated")).toBe(true);
    expect(pairs[0]?.querySelector("[data-diffstat-floor]")).not.toBeNull();
  });

  it("marks every truncated file, not just the first", async () => {
    await renderStats([
      doc("a.md", "one\n", "one\ntwo\n", true),
      doc("b.md", "one\n", "one\ntwo\n", false),
      doc("c.md", "one\n", "one\ntwo\n", true),
    ]);
    // Two files plus the aggregate that inherits their floor.
    expect(document.querySelectorAll("[data-diffstat-floor]").length).toBe(3);
  });
});
