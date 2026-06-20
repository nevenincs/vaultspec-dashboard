// Code Connect coverage for live Figma components generated from local surfaces.
// These bindings are reviewed live coverage surfaces in component-map.json.
import figma from "@figma/code-connect";
import type { ComponentProps } from "react";

import { ConfirmDialog } from "../../src/app/chrome/ConfirmDialog";
import { Dialog } from "../../src/app/chrome/Dialog";
import { BrowserModeToggle } from "../../src/app/left/BrowserModeToggle";
import { BrowserRegion } from "../../src/app/left/BrowserRegion";
import { RailFilter } from "../../src/app/left/RailFilter";
import { VaultBrowser } from "../../src/app/left/VaultBrowser";
import { WorkspacePicker } from "../../src/app/left/WorkspacePicker";
import { WorktreePicker } from "../../src/app/left/WorktreePicker";
import { KeyboardShortcuts } from "../../src/app/menu/KeyboardShortcuts";
import { CommandPalette } from "../../src/app/palette/CommandPalette";
import { ChangesOverview } from "../../src/app/right/ChangesOverview";
import { Inspector } from "../../src/app/right/Inspector";
import { NowStrip } from "../../src/app/right/NowStrip";
import { SearchTab } from "../../src/app/right/SearchTab";
import { StatusTab } from "../../src/app/right/StatusTab";
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
import { TierDial } from "../../src/app/stage/TierDial";
import { WorkingSet } from "../../src/app/stage/WorkingSet";
import { Minimap } from "../../src/app/timeline/Minimap";
import { Playhead, TimeTravelChip } from "../../src/app/timeline/Playhead";
import { RangeSelect } from "../../src/app/timeline/RangeSelect";
import { TimelineControls } from "../../src/app/timeline/TimelineControls";
import { CodeViewer } from "../../src/app/viewer/CodeViewer";
import { FrontmatterHeader } from "../../src/app/viewer/FrontmatterHeader";
import { MarkdownReader } from "../../src/app/viewer/MarkdownReader";

const coverageProps = <T,>() => ({}) as T;

figma.connect(BrowserModeToggle, "<MIRROR>?node-id=309-934", {
  example: () => (
    <BrowserModeToggle {...coverageProps<ComponentProps<typeof BrowserModeToggle>>()} />
  ),
});

figma.connect(BrowserRegion, "<MIRROR>?node-id=309-938", {
  example: () => (
    <BrowserRegion {...coverageProps<ComponentProps<typeof BrowserRegion>>()} />
  ),
});

figma.connect(CanvasStateOverlay, "<MIRROR>?node-id=309-942", {
  example: () => (
    <CanvasStateOverlay
      {...coverageProps<ComponentProps<typeof CanvasStateOverlay>>()}
    />
  ),
});

figma.connect(CategoryLegend, "<MIRROR>?node-id=309-946", {
  example: () => <CategoryLegend />,
});

figma.connect(ChangesOverview, "<MIRROR>?node-id=309-950", {
  example: () => <ChangesOverview />,
});

figma.connect(CommandPalette, "<MIRROR>?node-id=309-954", {
  example: () => <CommandPalette />,
});

figma.connect(ConfirmDialog, "<MIRROR>?node-id=309-958", {
  example: () => (
    <ConfirmDialog {...coverageProps<ComponentProps<typeof ConfirmDialog>>()} />
  ),
});

figma.connect(Dialog, "<MIRROR>?node-id=309-962", {
  example: () => <Dialog {...coverageProps<ComponentProps<typeof Dialog>>()} />,
});

figma.connect(Discover, "<MIRROR>?node-id=309-970", {
  example: () => <Discover {...coverageProps<ComponentProps<typeof Discover>>()} />,
});

figma.connect(FilterBar, "<MIRROR>?node-id=309-974", {
  example: () => <FilterBar {...coverageProps<ComponentProps<typeof FilterBar>>()} />,
});

figma.connect(FilterSidebar, "<MIRROR>?node-id=309-978", {
  example: () => (
    <FilterSidebar {...coverageProps<ComponentProps<typeof FilterSidebar>>()} />
  ),
});

figma.connect(FrontmatterHeader, "<MIRROR>?node-id=309-982", {
  example: () => (
    <FrontmatterHeader {...coverageProps<ComponentProps<typeof FrontmatterHeader>>()} />
  ),
});

figma.connect(GraphControls, "<MIRROR>?node-id=309-986", {
  example: () => <GraphControls />,
});

figma.connect(IconRail, "<MIRROR>?node-id=309-990", {
  example: () => <IconRail {...coverageProps<ComponentProps<typeof IconRail>>()} />,
});

figma.connect(Inspector, "<MIRROR>?node-id=309-994", {
  example: () => <Inspector />,
});

figma.connect(KeyboardShortcuts, "<MIRROR>?node-id=309-998", {
  example: () => <KeyboardShortcuts />,
});

figma.connect(LayoutSelector, "<MIRROR>?node-id=309-1002", {
  example: () => <LayoutSelector />,
});

figma.connect(LensSelector, "<MIRROR>?node-id=309-1006", {
  example: () => <LensSelector />,
});

figma.connect(MarkdownReader, "<MIRROR>?node-id=309-1010", {
  example: () => (
    <MarkdownReader {...coverageProps<ComponentProps<typeof MarkdownReader>>()} />
  ),
});

figma.connect(Minimap, "<MIRROR>?node-id=309-1014", {
  example: () => <Minimap {...coverageProps<ComponentProps<typeof Minimap>>()} />,
});

figma.connect(MinimapWidget, "<MIRROR>?node-id=309-1018", {
  example: () => (
    <MinimapWidget {...coverageProps<ComponentProps<typeof MinimapWidget>>()} />
  ),
});

figma.connect(NowStrip, "<MIRROR>?node-id=309-1022", {
  example: () => <NowStrip />,
});

figma.connect(PlanStepTree, "<MIRROR>?node-id=309-1030", {
  example: () => (
    <PlanStepTree {...coverageProps<ComponentProps<typeof PlanStepTree>>()} />
  ),
});

figma.connect(Playhead, "<MIRROR>?node-id=309-1034", {
  example: () => <Playhead {...coverageProps<ComponentProps<typeof Playhead>>()} />,
});

figma.connect(RailFilter, "<MIRROR>?node-id=309-1042", {
  example: () => <RailFilter {...coverageProps<ComponentProps<typeof RailFilter>>()} />,
});

figma.connect(RangeSelect, "<MIRROR>?node-id=309-1046", {
  example: () => <RangeSelect />,
});

figma.connect(SearchTab, "<MIRROR>?node-id=309-1050", {
  example: () => <SearchTab />,
});

figma.connect(SettingsDialog, "<MIRROR>?node-id=309-1054", {
  example: () => <SettingsDialog />,
});

figma.connect(Stage, "<MIRROR>?node-id=309-1058", {
  example: () => <Stage />,
});

figma.connect(StatusTab, "<MIRROR>?node-id=309-1066", {
  example: () => <StatusTab />,
});

figma.connect(TierDial, "<MIRROR>?node-id=309-1070", {
  example: () => <TierDial />,
});

figma.connect(TimelineControls, "<MIRROR>?node-id=309-1074", {
  example: () => <TimelineControls />,
});

figma.connect(TimeTravelChip, "<MIRROR>?node-id=309-1078", {
  example: () => (
    <TimeTravelChip {...coverageProps<ComponentProps<typeof TimeTravelChip>>()} />
  ),
});

figma.connect(VaultBrowser, "<MIRROR>?node-id=309-1082", {
  example: () => (
    <VaultBrowser {...coverageProps<ComponentProps<typeof VaultBrowser>>()} />
  ),
});

figma.connect(WorkingSet, "<MIRROR>?node-id=309-1090", {
  example: () => <WorkingSet {...coverageProps<ComponentProps<typeof WorkingSet>>()} />,
});

figma.connect(WorkspacePicker, "<MIRROR>?node-id=309-1094", {
  example: () => <WorkspacePicker />,
});

figma.connect(WorktreePicker, "<MIRROR>?node-id=309-1098", {
  example: () => (
    <WorktreePicker {...coverageProps<ComponentProps<typeof WorktreePicker>>()} />
  ),
});
