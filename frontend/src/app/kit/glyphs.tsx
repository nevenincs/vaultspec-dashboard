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
  ChevronDown,
  ChevronRight,
  Crosshair,
  File,
  Folder,
  FolderPlus,
  Maximize,
  Minus,
  PanelLeft,
  PanelRight,
  Plus,
} from "lucide-react";
import { Books, Gear, Graph, TreeStructure } from "@phosphor-icons/react";

// Structural chrome — Lucide. Re-exported under their binding Figma names.
export {
  FolderPlus,
  Plus,
  Minus,
  File,
  Folder,
  ChevronRight,
  ChevronDown,
  Maximize,
  Crosshair,
  PanelLeft,
  PanelRight,
  Calendar,
};

// Expressive / domain marks — Phosphor. `Hierarchy` is the connected-node graph
// mark (Phosphor ships it as `Graph`; the binding board names the glyph
// "Hierarchy", so the stable export keeps that name).
export { Books, TreeStructure, Gear };
export { Graph as Hierarchy };
