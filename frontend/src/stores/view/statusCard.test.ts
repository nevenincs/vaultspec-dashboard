import { describe, expect, it } from "vitest";

import type { EngineNode } from "../server/engine";
import {
  deriveStatusCardBloomMotionView,
  deriveStatusCardPresentationView,
  statusCardModelFromNode,
  statusCardRolloutView,
} from "./statusCard";

describe("status card presentation view", () => {
  it("projects rollout count labels and clamped widths", () => {
    expect(statusCardRolloutView({ done: 7, total: 12 })).toEqual({
      done: 7,
      total: 12,
      label: "7/12",
      width: "58%",
    });

    expect(statusCardRolloutView({ done: 16, total: 12 })?.width).toBe("100%");
    expect(statusCardRolloutView({ done: 1, total: 0 })).toBeNull();
  });

  it("projects authority and status magnitude into one microline", () => {
    expect(
      deriveStatusCardPresentationView({
        authorityClass: "critical finding",
        status: { value: "critical", class: "graded", ordinal: 4 },
      }).microline,
    ).toBe("critical finding · severity 4/4");

    expect(
      deriveStatusCardPresentationView({
        status: { value: "L2", class: "tiered", ordinal: 2 },
      }).microline,
    ).toBe("tier 2/4");

    expect(deriveStatusCardPresentationView({}).microline).toBeNull();
  });

  it("projects hover-card bloom motion behind the status-card seam", () => {
    expect(deriveStatusCardBloomMotionView(false, false)).toMatchObject({
      motion: "bloom",
      reducedMotion: false,
      style: {
        opacity: 0,
        transform: "scale(0.92)",
        transformOrigin: "top left",
      },
    });
    expect(deriveStatusCardBloomMotionView(false, true).style).toMatchObject({
      opacity: 1,
      transform: "scale(1)",
    });
    expect(deriveStatusCardBloomMotionView(true, true)).toMatchObject({
      motion: "crossfade",
      reducedMotion: true,
      style: {
        opacity: 1,
      },
    });
    expect(deriveStatusCardBloomMotionView(true, true).style).not.toHaveProperty(
      "transform",
    );
  });

  it("projects a typed status-card model from the node wire shape", () => {
    const node: EngineNode = {
      id: "doc:plan",
      kind: "plan",
      title: "A plan",
      status_value: "L2",
      status_class: "tiered",
      authority_class: "L2 plan",
      lifecycle: { state: "active", progress: { done: 3, total: 8 } },
    };

    expect(statusCardModelFromNode(node)).toMatchObject({
      id: "doc:plan",
      kind: "plan",
      title: "A plan",
      status: { value: "L2", class: "tiered" },
      authorityClass: "L2 plan",
      progress: { done: 3, total: 8 },
      category: "plan",
      typeContent: {
        kind: "plan",
        status: "In progress",
        tier: "L2",
        steps: { done: 3, total: 8 },
      },
    });
  });
});
