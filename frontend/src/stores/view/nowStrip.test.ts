import { describe, expect, it } from "vitest";

import type { StatusRollupView } from "../server/queries";
import { deriveNowStripView } from "./nowStrip";

describe("deriveNowStripView", () => {
  it("projects the status rollup into render-ready cards and a live message", () => {
    const view = deriveNowStripView({
      engineUnreachable: false,
      degradations: ["semantic"],
      git: {
        loading: false,
        errored: false,
        degraded: false,
        git: { branch: "main", dirty: true, ahead: 1 },
        dirty: true,
        retry: () => undefined,
      },
      core: {
        loading: false,
        errored: false,
        reachable: true,
        vaultHealth: "green",
      },
      rag: {
        presentation: { key: "operations:searchMaintenance.states.started" },
        loading: false,
        errored: false,
        degraded: false,
        running: true,
        ready: true,
        service: "running",
        watcher: "watching",
        index: "fresh",
        jobs: 2,
      },
    } satisfies StatusRollupView);

    expect(view.engineUnreachable).toBe(false);
    expect(view.engineUnreachableLabel).toBe("engine unreachable — start it with");
    expect(view.engineCommandLabel).toBe("vaultspec serve");
    expect(view.degradations).toEqual(["semantic"]);
    expect(view.degradationLabel).toBe("degraded: semantic");
    expect(view.ragLive).toBe("rag ready");
    expect(view.cards.map((entry) => entry.card.label)).toEqual(["git", "core", "rag"]);
    expect(view.cards[0]?.card).toMatchObject({
      tone: "warn",
      toneClass: "border-state-stale/40 bg-paper-raised text-ink",
      toneInkClass: "text-state-stale",
      detail: "main · ↑1 dirty",
    });
    expect(view.cards[2]).toMatchObject({
      jobs: 2,
      jobsLabel: "2 jobs",
      loading: false,
      card: {
        tone: "ok",
        toneClass: "border-rule bg-paper-raised text-ink",
        toneInkClass: "text-state-active",
        detail: "ready · watching · index fresh",
      },
    });
  });

  it("projects singular job count and absent degradation copy", () => {
    const view = deriveNowStripView({
      engineUnreachable: true,
      degradations: [],
      git: {
        loading: true,
        errored: false,
        degraded: false,
        dirty: false,
        retry: () => undefined,
      },
      core: {
        loading: true,
        errored: false,
        reachable: false,
      },
      rag: {
        presentation: { key: "operations:searchMaintenance.states.started" },
        loading: false,
        errored: false,
        degraded: false,
        running: true,
        ready: false,
        service: "running",
        watcher: "starting",
        index: "warming",
        jobs: 1,
      },
    } satisfies StatusRollupView);

    expect(view.engineUnreachable).toBe(true);
    expect(view.degradationLabel).toBeNull();
    expect(view.cards[2]).toMatchObject({
      jobs: 1,
      jobsLabel: "1 job",
      card: {
        tone: "warn",
        toneClass: "border-state-stale/40 bg-paper-raised text-ink",
        toneInkClass: "text-state-stale",
        detail: "starting · starting · index warming",
      },
    });
  });
});
