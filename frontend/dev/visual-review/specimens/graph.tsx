// Specimens: scene-ADJACENT stage chrome (`GraphControls`, `MinimapWidget`).
//
// These surfaces are DOM chrome beside the WebGL canvas. They import the scene
// singleton, which is import-safe (the GL context is created only on `mount()`),
// so the chrome renders here exactly as shipped — while anything scene-DRAWN
// (the minimap bitmap) is honestly absent, and control clicks command a scene that
// is not mounted on this page.

import type { IDockviewPanelProps } from "dockview";

import {
  GraphNavControls,
  GraphSettingsPanel,
  GraphSimControl,
} from "@app/app/stage/GraphControls";
import { GraphPanel } from "@app/app/stage/GraphPanel";
import { MinimapWidget } from "@app/app/stage/MinimapWidget";

import type { SpecimenDef } from "../registry";
import { seedSessionAndDashboardState, tiersDown } from "./support";
import { seedTimeline } from "./timeline";

export const graphSpecimens: Readonly<Record<string, SpecimenDef>> = {
  "stage-graphcontrols": {
    note: "Graph chrome (nav cluster, simulation control, settings panel trigger). It has no wire-served states of its own — the state axis varies only the shared dashboard-state seed (loading: unresolved; degraded: structural tier down). Controls command the app's scene singleton, which is not mounted on this page.",
    host: "relative h-[18rem] p-fg-3",
    seed: (client, state) => {
      if (state === "loading") return;
      seedSessionAndDashboardState(
        client,
        state === "degraded" ? { tiers: tiersDown(["structural"]) } : {},
      );
    },
    render: () => (
      <div className="flex flex-wrap items-start gap-fg-4">
        <GraphNavControls />
        <GraphSimControl />
        <GraphSettingsPanel />
      </div>
    ),
  },
  "stage-graphpanel": {
    note: "The one graph-plus-timeline dockview panel. The graph area is a transparent placeholder the pinned canvas host paints over in the app — honestly empty here (the canvas singleton is not on this page); the tethered timeline underneath renders from the shared timeline seeds. Mounting also drives the real canvas-pin visibility signal, which nothing on this page consumes.",
    host: "relative h-[22rem]",
    seed: (client, state) => seedTimeline(client, state),
    render: () => <GraphPanel {...({} as IDockviewPanelProps)} />,
  },
  "stage-minimapwidget": {
    note: "The card shell and canvas element are chrome and render as shipped; every pixel inside the canvas is drawn by the scene layer, so the overview bitmap is honestly absent here. No wire-served states — the state axis is inert for this surface.",
    host: "relative h-[14rem] p-fg-3",
    render: () => <MinimapWidget embedded />,
  },
};
