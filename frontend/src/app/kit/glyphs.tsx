// Centralized glyph set for the rebuilt component kit (figma-frontend-rewrite
// W01.P02.S05; binding kit board "Design System — Components" 135:2). The Figma
// glyph row pulls from the two sanctioned families ONLY
// (icons-come-from-the-two-sanctioned-families): Lucide carries the invisible
// STRUCTURAL chrome (panels, chevrons, zoom +/-, crosshair, file/folder nav,
// calendar), and Phosphor carries the EXPRESSIVE / domain marks (the vault
// "Books", the node-graph "Hierarchy", the document "TreeStructure", the settings
// "Gear"). Every later kit component and surface composes its iconography from
// THIS module so the family discipline lives in one place and a glyph swap is one
// edit, never an ad-hoc per-surface import.
//
// Naming follows the binding Figma glyph names. Where a Figma name has no exact
// member in its family, it aliases the closest in-family mark (Hierarchy -> the
// Phosphor connected-node `Graph`), so consumers always reference the stable
// Figma name. Both families' components accept a `size` prop (px) plus `className`
// for token-driven color, so a consumer renders e.g. `<File size={16} />`.

import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  File,
  Folder,
  FolderPlus,
  Funnel,
  GitBranch,
  House,
  Library,
  Maximize,
  Menu,
  Minus,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Gear, Graph, TreeStructure } from "@phosphor-icons/react";

// Structural chrome — Lucide. Re-exported under their binding Figma names.
// The mobile additions (mobile-responsive-layout) mirror the Figma Icon-set
// glyphs authored for the compact frames: the search MagnifyingGlass (Lucide
// `Search`), the filter Funnel, the back ChevronLeft, and the activity GitBranch.
export {
  FolderPlus,
  Plus,
  Minus,
  File,
  Folder,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Maximize,
  Crosshair,
  Menu,
  PanelLeft,
  PanelRight,
  Calendar,
  Funnel,
  GitBranch,
  Play,
  Pause,
};
export { Search as MagnifyingGlass };
// The vault/browse mark is structural chrome → Lucide `Library` (one family with
// the other chrome icons), re-exported under the binding name `Books`.
export { Library as Books };
// The compact unified-rail "Home" tab mark (mobile-unified-rail ADR): the Home pane
// stacks Status + Browse, so its bottom-tab glyph is the neutral structural `House`
// (Lucide), re-exported under the binding name `Home`.
export { House as Home };

// State-mode marks (state-mode-uniformity): the shared caution mark for the DEGRADED
// mode (`TriangleAlert`) and the positive `Check` for the EMPTY/settled mode, sourced
// here so every state surface composes the SAME glyph — never an ad-hoc per-surface
// `lucide-react` import. `Folder` (above) is the neutral empty-corpus mark.
export { TriangleAlert, Check };

// Expressive / domain marks — Phosphor. `Hierarchy` is the connected-node graph
// mark (Phosphor ships it as `Graph`; the binding board names the glyph
// "Hierarchy", so the stable export keeps that name).
export { TreeStructure, Gear };
export { Graph as Hierarchy };
