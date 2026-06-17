// The centralized component kit barrel (figma-frontend-rewrite W01.P02 — binding
// Figma kit board "Design System — Components" 135:2). Every surface imports its
// standardized primitives from here so the kit is the single, discoverable source
// of truth: a "control on screen" always resolves to a real, shared definition,
// never a per-surface hand-built one (design-system-is-centralized). All primitives
// compose the binding Figma token tier (--color-* / --text-fg-* / --radius-fg-* /
// --shadow-fg-* / --spacing-fg-*) — no raw hex, no loose sizes.

// Core controls (S03)
export { Button } from "./Button";
export type { ButtonProps, ButtonVariant } from "./Button";
export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";
export { Tab } from "./Tab";
export type { TabProps } from "./Tab";
export { Chip, Badge } from "./Chip";
export type { ChipProps, BadgeProps, BadgeTone } from "./Chip";
export { StatusDot } from "./StatusDot";
export type { StatusDotProps } from "./StatusDot";

// Inputs (S04)
export { SearchField } from "./SearchField";
export type { SearchFieldProps } from "./SearchField";
export { Switch } from "./Switch";
export type { SwitchProps } from "./Switch";
export { SegmentedToggle, useSegmentedContext } from "./SegmentedToggle";
export type { SegmentedToggleProps } from "./SegmentedToggle";
export { Segment } from "./Segment";
export type { SegmentProps } from "./Segment";
export { Slider } from "./Slider";
export type { SliderProps } from "./Slider";
export { DropdownButton } from "./DropdownButton";
export type { DropdownButtonProps } from "./DropdownButton";

// Containers and misc (S05)
export { Card } from "./Card";
export type { CardProps, CardElevation } from "./Card";
export { ListRow } from "./ListRow";
export type { ListRowProps } from "./ListRow";
export { DocRow } from "./DocRow";
export type { DocRowProps } from "./DocRow";
export { SectionLabel } from "./SectionLabel";
export type { SectionLabelProps } from "./SectionLabel";
export { Divider } from "./Divider";
export type { DividerProps, DividerTone, DividerOrientation } from "./Divider";
export { ProgressBar } from "./ProgressBar";
export type { ProgressBarProps } from "./ProgressBar";
export { Kbd } from "./Kbd";
export type { KbdProps } from "./Kbd";
export { Tooltip } from "./Tooltip";
export type { TooltipProps, TooltipSide } from "./Tooltip";
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbProps, BreadcrumbItem } from "./Breadcrumb";
export { TreeRow } from "./TreeRow";
export type { TreeRowProps, TreeRowState } from "./TreeRow";
export { PropertyRow } from "./PropertyRow";
export type { PropertyRowProps } from "./PropertyRow";
export { CodeBlock } from "./CodeBlock";
export type { CodeBlockProps } from "./CodeBlock";

// Shared category vocabulary (Chip / StatusDot color mapping)
export { categoryToken, categoryColorVar } from "./category";
export type { Category, CategoryToken } from "./category";

// Centralized glyph set (the two sanctioned families, under binding Figma names)
export * from "./glyphs";
