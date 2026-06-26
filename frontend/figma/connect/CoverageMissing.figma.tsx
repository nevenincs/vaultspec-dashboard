// Code Connect coverage for live Figma surfaces, bound to their current nodes in
// the binding file. Repointed from the retired `309-*` placeholder frame to the
// live surface/component nodes (figma-code-connect: node URLs must resolve in the
// live file SlhonORmySdoSMTQgDWw3w). Components whose Figma design no longer exists
// (CodeTree, RailTabs, FoldSection, MarkdownDocView, MarkdownReader, NowStrip,
// SearchTab, TierDial) were dropped — a binding to a non-existent node is the
// defect this file existed to avoid.
import figma from "@figma/code-connect";
import type { ComponentProps } from "react";

import { ConfirmDialog } from "../../src/app/chrome/ConfirmDialog";
import { Dialog } from "../../src/app/chrome/Dialog";
import { BrowserModeToggle } from "../../src/app/left/BrowserModeToggle";
import { BrowserRegion } from "../../src/app/left/BrowserRegion";
import { VaultBrowser } from "../../src/app/left/VaultBrowser";
import { WorkspacePicker } from "../../src/app/left/WorkspacePicker";
import { WorktreePicker } from "../../src/app/left/WorktreePicker";
import { KeyboardShortcuts } from "../../src/app/menu/KeyboardShortcuts";
import { CommandPalette } from "../../src/app/palette/CommandPalette";
import { ChangesOverview } from "../../src/app/right/ChangesOverview";
import { Inspector } from "../../src/app/right/Inspector";
import { PlanStepTree } from "../../src/app/right/PlanStepTree";
import { SettingsDialog } from "../../src/app/settings/SettingsDialog";
import { IconRail } from "../../src/app/shell/IconRail";
import { CanvasStateOverlay } from "../../src/app/stage/CanvasStateOverlay";
import { CategoryLegend } from "../../src/app/stage/CategoryLegend";
import { Discover } from "../../src/app/stage/Discover";
import { FilterBar } from "../../src/app/stage/FilterBar";
import { FilterSidebar } from "../../src/app/stage/FilterSidebar";
import { GraphControls } from "../../src/app/stage/GraphControls";
import { LayoutSelector, LensSelector } from "../../src/app/stage/LensSelector";
import { MinimapWidget } from "../../src/app/stage/MinimapWidget";
import { Stage } from "../../src/app/stage/Stage";
import { WorkingSet } from "../../src/app/stage/WorkingSet";
import { Playhead, TimeTravelChip } from "../../src/app/timeline/Playhead";
import { RangeSelect } from "../../src/app/timeline/RangeSelect";
import { TimelineControls } from "../../src/app/timeline/TimelineControls";
import { FrontmatterHeader } from "../../src/app/viewer/FrontmatterHeader";

const coverageProps = <T,>() => ({}) as T;

figma.connect(BrowserModeToggle, "<MIRROR>?node-id=635-2500", {
  example: () => (
    <BrowserModeToggle {...coverageProps<ComponentProps<typeof BrowserModeToggle>>()} />
  ),
});

figma.connect(BrowserRegion, "<MIRROR>?node-id=244-750", {
  example: () => (
    <BrowserRegion {...coverageProps<ComponentProps<typeof BrowserRegion>>()} />
  ),
});

figma.connect(VaultBrowser, "<MIRROR>?node-id=244-750", {
  example: () => (
    <VaultBrowser {...coverageProps<ComponentProps<typeof VaultBrowser>>()} />
  ),
});

figma.connect(WorkspacePicker, "<MIRROR>?node-id=635-2510", {
  example: () => <WorkspacePicker />,
});

figma.connect(WorktreePicker, "<MIRROR>?node-id=635-2517", {
  example: () => (
    <WorktreePicker {...coverageProps<ComponentProps<typeof WorktreePicker>>()} />
  ),
});

figma.connect(KeyboardShortcuts, "<MIRROR>?node-id=635-2489", {
  example: () => <KeyboardShortcuts />,
});

figma.connect(CommandPalette, "<MIRROR>?node-id=634-2090", {
  example: () => <CommandPalette />,
});

figma.connect(ChangesOverview, "<MIRROR>?node-id=863-4168", {
  example: () => <ChangesOverview />,
});

figma.connect(Inspector, "<MIRROR>?node-id=635-3126", {
  example: () => <Inspector />,
});

figma.connect(PlanStepTree, "<MIRROR>?node-id=863-4135", {
  example: () => (
    <PlanStepTree {...coverageProps<ComponentProps<typeof PlanStepTree>>()} />
  ),
});

figma.connect(SettingsDialog, "<MIRROR>?node-id=635-3108", {
  example: () => <SettingsDialog />,
});

figma.connect(IconRail, "<MIRROR>?node-id=635-3190", {
  example: () => <IconRail {...coverageProps<ComponentProps<typeof IconRail>>()} />,
});

figma.connect(CanvasStateOverlay, "<MIRROR>?node-id=635-3196", {
  example: () => (
    <CanvasStateOverlay
      {...coverageProps<ComponentProps<typeof CanvasStateOverlay>>()}
    />
  ),
});

figma.connect(CategoryLegend, "<MIRROR>?node-id=618-1966", {
  example: () => <CategoryLegend />,
});

figma.connect(Discover, "<MIRROR>?node-id=635-3163", {
  example: () => <Discover {...coverageProps<ComponentProps<typeof Discover>>()} />,
});

figma.connect(FilterBar, "<MIRROR>?node-id=636-1934", {
  example: () => <FilterBar {...coverageProps<ComponentProps<typeof FilterBar>>()} />,
});

figma.connect(FilterSidebar, "<MIRROR>?node-id=838-3906", {
  example: () => (
    <FilterSidebar {...coverageProps<ComponentProps<typeof FilterSidebar>>()} />
  ),
});

figma.connect(GraphControls, "<MIRROR>?node-id=714-2630", {
  example: () => <GraphControls />,
});

figma.connect(LayoutSelector, "<MIRROR>?node-id=635-2524", {
  example: () => <LayoutSelector />,
});

figma.connect(LensSelector, "<MIRROR>?node-id=635-2531", {
  example: () => <LensSelector />,
});

figma.connect(MinimapWidget, "<MIRROR>?node-id=636-2144", {
  example: () => (
    <MinimapWidget {...coverageProps<ComponentProps<typeof MinimapWidget>>()} />
  ),
});

figma.connect(Stage, "<MIRROR>?node-id=636-2160", {
  example: () => <Stage />,
});

figma.connect(WorkingSet, "<MIRROR>?node-id=635-3145", {
  example: () => <WorkingSet {...coverageProps<ComponentProps<typeof WorkingSet>>()} />,
});

figma.connect(Playhead, "<MIRROR>?node-id=636-2157", {
  example: () => <Playhead {...coverageProps<ComponentProps<typeof Playhead>>()} />,
});

figma.connect(TimeTravelChip, "<MIRROR>?node-id=635-2503", {
  example: () => (
    <TimeTravelChip {...coverageProps<ComponentProps<typeof TimeTravelChip>>()} />
  ),
});

figma.connect(RangeSelect, "<MIRROR>?node-id=636-2152", {
  example: () => <RangeSelect />,
});

figma.connect(TimelineControls, "<MIRROR>?node-id=239-713", {
  example: () => <TimelineControls />,
});

figma.connect(FrontmatterHeader, "<MIRROR>?node-id=636-1920", {
  example: () => (
    <FrontmatterHeader {...coverageProps<ComponentProps<typeof FrontmatterHeader>>()} />
  ),
});

figma.connect(ConfirmDialog, "<MIRROR>?node-id=635-2470", {
  example: () => (
    <ConfirmDialog {...coverageProps<ComponentProps<typeof ConfirmDialog>>()} />
  ),
});

figma.connect(Dialog, "<MIRROR>?node-id=635-3130", {
  example: () => <Dialog {...coverageProps<ComponentProps<typeof Dialog>>()} />,
});
