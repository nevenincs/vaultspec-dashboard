// @vitest-environment happy-dom

import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, describe, expect, it } from "vitest";

import {
  createTestLocalizationRuntime,
  ltrTestLocale,
  rtlTestLocale,
} from "../../localization/testing";
import { resolveMessageResult } from "../../platform/localization/fallback";
import { docTypePresentation } from "../../stores/server/docTypeVocabulary";
import type { GraphSlice, NodeDetail } from "../../stores/server/engine";
import { engineKeys } from "../../stores/server/queries";
import { queryClient } from "../../stores/server/queryClient";
import {
  NODE_INTERIOR_MESSAGES,
  nodeInteriorProgressMessage,
} from "../../stores/view/nodeInterior";
import { NodeInterior } from "./NodeInterior";

afterEach(() => {
  cleanup();
  queryClient.clear();
});

function renderInterior(id: string, scope: string) {
  const runtime = createTestLocalizationRuntime();
  const view = render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <NodeInterior id={id} scope={scope} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
  return { runtime, ...view };
}

describe("NodeInterior localized safe presentation", () => {
  it("updates the same loading node for English, French, and Arabic", async () => {
    const { runtime, container } = renderInterior("doc:does-not-exist-pending", "main");
    const status = screen.getByRole("status");
    const label = container.querySelector(".sr-only")!;
    expect(label.textContent).toBe(
      resolveMessageResult(runtime, NODE_INTERIOR_MESSAGES.loading).message,
    );

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(label.textContent).toBe(
      resolveMessageResult(runtime, NODE_INTERIOR_MESSAGES.loading).message,
    );
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(label.textContent).toBe(
      resolveMessageResult(runtime, NODE_INTERIOR_MESSAGES.loading).message,
    );
    expect(status.getAttribute("aria-busy")).toBe("true");
  });

  it("localizes plural progress and never renders step identifiers as fallback", async () => {
    const id = "doc:private-plan-id";
    const scope = "main";
    const detail: NodeDetail = {
      node: {
        id,
        kind: "Document",
        doc_type: "plan",
        lifecycle: { state: "active", progress: { done: 1234, total: 2345 } },
      },
      interior: {
        nodes: [
          { id: "private-step-id", kind: "step" },
          { id: "another-private-step-id", kind: "step", title: "Authored title" },
        ],
        edges: [],
        tiers: {},
      },
      tiers: {},
    };
    queryClient.setQueryData(engineKeys.node(scope, id), detail);
    const { runtime, container } = renderInterior(id, scope);
    const descriptor = nodeInteriorProgressMessage(1234, 2345)!;
    const progress = container.querySelector("[data-tabular]")!;
    expect(progress.textContent).toBe(
      resolveMessageResult(runtime, descriptor).message,
    );
    expect(screen.getByText("Authored title")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private-step-id");
    expect(document.body.textContent).not.toContain("another-private-step-id");

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(progress.textContent).toBe(
      resolveMessageResult(runtime, descriptor).message,
    );
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(progress.textContent).toBe(
      resolveMessageResult(runtime, descriptor).message,
    );
  });

  it("renders real-contract feature lifecycle rows from closed document types", async () => {
    const id = "feature:state";
    const scope = "main";
    const researchId = "doc:hostile-research-id";
    const adrId = "doc:hostile-adr-id";
    const execId = "doc:hostile-exec-id";
    const unknownId = "doc:hostile-unknown-id";
    queryClient.setQueryData(
      engineKeys.graph(scope, { feature_tags: ["state"] }, undefined, "document"),
      {
        nodes: [
          {
            id: adrId,
            kind: "Document",
            doc_type: "adr",
            title: adrId,
          },
          {
            id: unknownId,
            kind: "Document",
            doc_type: "private_type",
            title: "private unknown title",
          },
          {
            id: execId,
            kind: "Document",
            doc_type: "exec",
            title: "   ",
          },
          {
            id: researchId,
            kind: "Document",
            doc_type: "research",
            title: "  Authored research title  ",
          },
          { id: "doc:synthetic-mask", kind: "audit", title: "legacy kind" },
        ],
        edges: [],
        tiers: {},
      } satisfies GraphSlice,
    );

    const { runtime, container } = renderInterior(id, scope);
    const axis = container.querySelector("[data-lifecycle-axis]")!;
    const buttons = axis.querySelectorAll("button");
    const research = docTypePresentation("research")!;
    const adr = docTypePresentation("adr")!;
    const exec = docTypePresentation("exec")!;
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.textContent).toBe(
      resolveMessageResult(runtime, research.label).message,
    );
    expect(buttons[0]?.getAttribute("title")).toBe("  Authored research title  ");
    expect(buttons[1]?.textContent).toBe(
      resolveMessageResult(runtime, adr.label).message,
    );
    expect(buttons[1]?.getAttribute("title")).toBe(
      resolveMessageResult(runtime, adr.label).message,
    );
    expect(buttons[2]?.textContent).toBe(
      resolveMessageResult(runtime, exec.label).message,
    );
    expect(buttons[2]?.getAttribute("title")).toBe(
      resolveMessageResult(runtime, exec.label).message,
    );

    const hostileValues = [
      researchId,
      adrId,
      execId,
      unknownId,
      "private_type",
      "private unknown title",
      "doc:synthetic-mask",
      "legacy kind",
    ];
    for (const hostile of hostileValues) {
      expect(axis.outerHTML).not.toContain(hostile);
    }

    for (const locale of [ltrTestLocale, rtlTestLocale]) {
      await act(() => runtime.changeLanguage(locale));
      expect(buttons[0]?.textContent).toBe(
        resolveMessageResult(runtime, research.label).message,
      );
      expect(buttons[0]?.getAttribute("title")).toBe("  Authored research title  ");
      expect(buttons[1]?.textContent).toBe(
        resolveMessageResult(runtime, adr.label).message,
      );
      expect(buttons[1]?.getAttribute("title")).toBe(
        resolveMessageResult(runtime, adr.label).message,
      );
      expect(buttons[2]?.textContent).toBe(
        resolveMessageResult(runtime, exec.label).message,
      );
      expect(buttons[2]?.getAttribute("title")).toBe(
        resolveMessageResult(runtime, exec.label).message,
      );
      for (const hostile of hostileValues) {
        expect(axis.outerHTML).not.toContain(hostile);
      }
    }
  });

  it("omits raw node identity and unknown lifecycle state", async () => {
    const id = "doc:secret-node-id";
    const scope = "main";
    queryClient.setQueryData(engineKeys.node(scope, id), {
      node: {
        id,
        kind: "Document",
        doc_type: "adr",
        title: id,
        lifecycle: { state: "private_state_token" },
      },
      tiers: {},
    } satisfies NodeDetail);
    const { runtime } = renderInterior(id, scope);
    const typeLabel = screen.getByText("Type");
    const typeValue = screen.getByText("Decisions");
    expect(document.body.textContent).not.toContain(id);
    expect(document.body.innerHTML).not.toContain(id);
    expect(document.body.textContent).not.toContain("private_state_token");
    expect(document.body.textContent).not.toContain("adr");

    await act(() => runtime.changeLanguage(ltrTestLocale));
    expect(typeLabel.textContent).toBe(
      resolveMessageResult(runtime, NODE_INTERIOR_MESSAGES.type).message,
    );
    expect(typeValue.textContent).not.toBe("Decisions");
    await act(() => runtime.changeLanguage(rtlTestLocale));
    expect(typeLabel.textContent).toBe(
      resolveMessageResult(runtime, NODE_INTERIOR_MESSAGES.type).message,
    );
    expect(document.body.textContent).not.toContain(id);
    expect(document.body.textContent).not.toContain("private_state_token");
  });
});
