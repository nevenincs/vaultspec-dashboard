// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../../localization/testing";
import { resolveMessageResult } from "../../../platform/localization/fallback";
import type { EngineNode, NodeEvidence } from "../../../stores/server/engine";
import {
  cardModelFromEvidence,
  type HoverCardModel,
} from "../../../stores/view/hoverCard";
import { HoverCard } from "./HoverCard";

afterEach(cleanup);

const hostile = {
  id: "doc:private-id",
  path: "/private/research.md",
  symbol: "secretSymbol",
  sha: "private-sha-abcdef",
  state: "private_resolution_state",
  tier: "private_tier",
  relation: "private_relation",
  confidence: "0.91",
};

function productionModel(): HoverCardModel {
  const node: EngineNode = {
    id: hostile.id,
    kind: "adr",
    doc_type: "adr",
    title: "  Authored title  ",
  };
  const evidence: NodeEvidence = {
    documents: [{ path: hostile.path, doc_type: "private_kind" }],
    code_locations: [
      { path: "/private/code.ts", symbol: hostile.symbol, state: hostile.state },
    ],
    commits: [
      {
        sha: hostile.sha,
        subject: "  Authored commit subject  ",
        confidence: 0.91,
      },
    ],
    tiers: { [hostile.tier]: [{ relation: hostile.relation }] } as never,
  };
  return cardModelFromEvidence(node, evidence, "  Authored summary  ")!;
}

function HoverHarness({ model }: { model: HoverCardModel }) {
  const [opened, setOpened] = useState(false);
  return (
    <>
      <HoverCard model={model} onOpen={(id) => setOpened(id === model.id)} />
      <output>{opened ? "opened" : "closed"}</output>
    </>
  );
}

function setup() {
  const runtime = createTestLocalizationRuntime();
  const model = productionModel();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <HoverHarness model={model} />
    </I18nextProvider>,
  );
  return { runtime, model, ...view };
}

describe("HoverCard safe localized presentation", () => {
  it("renders semantic counts and byte-exact authored content without metadata", () => {
    const { container } = setup();
    expect(container.querySelector("h3")?.textContent).toBe("  Authored title  ");
    expect(container.querySelector("[data-hover-summary]")?.textContent).toBe(
      "  Authored summary  ",
    );
    expect(container.querySelector("li")?.textContent).toBe(
      "  Authored commit subject  ",
    );
    expect(screen.getByText("1 related document")).toBeTruthy();
    expect(screen.getByText("1 code location")).toBeTruthy();
    expect(screen.getByText("1 related change")).toBeTruthy();

    for (const forbidden of Object.values(hostile)) {
      expect(document.body.textContent).not.toContain(forbidden);
      expect(document.body.innerHTML).not.toContain(forbidden);
    }
    expect(document.body.innerHTML).not.toContain("private_kind");
  });

  it("updates the same accessible and count nodes for French and Arabic", async () => {
    const { runtime, model, container } = setup();
    const dialog = screen.getByRole("dialog");
    const type = container.querySelector("[data-hover-doc-type]")!;
    const documents = container.querySelector("[data-hover-document-count]")!;
    const code = container.querySelector("[data-hover-code-count]")!;
    const commits = container.querySelector("[data-hover-commit-count]")!;
    const open = container.querySelector<HTMLButtonElement>("[data-hover-open]")!;

    for (const locale of [ltrTestLocale, rtlTestLocale]) {
      await act(() => runtime.changeLanguage(locale));
      expect(dialog.getAttribute("aria-label")).toBe(
        resolveMessageResult(runtime, {
          key: "graph:hover.accessibility.detailsFor",
          values: { title: model.title },
        }).message,
      );
      expect(open.getAttribute("aria-label")).toBe(
        resolveMessageResult(runtime, {
          key: "graph:hover.accessibility.open",
          values: { title: model.title },
        }).message,
      );
      expect(type.textContent).toBe(
        resolveMessageResult(runtime, model.typeLabel).message,
      );
      expect(documents.textContent).toBe(
        resolveMessageResult(runtime, {
          key: "graph:hover.evidence.documents",
          values: { count: 1 },
        }).message,
      );
      expect(code.textContent).toBe(
        resolveMessageResult(runtime, {
          key: "graph:hover.evidence.codeLocations",
          values: { count: 1 },
        }).message,
      );
      expect(commits.textContent).toBe(
        resolveMessageResult(runtime, {
          key: "graph:hover.evidence.commits",
          values: { count: 1 },
        }).message,
      );
    }
  });

  it("opens through the real stateful callback without exposing the identifier", () => {
    const { container } = setup();
    expect(screen.getByText("closed")).toBeTruthy();
    fireEvent.click(container.querySelector<HTMLButtonElement>("[data-hover-open]")!);
    expect(screen.getByText("opened")).toBeTruthy();
    expect(document.body.innerHTML).not.toContain(hostile.id);
  });
});
